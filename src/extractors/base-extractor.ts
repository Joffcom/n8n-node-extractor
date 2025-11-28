import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  CompleteNodeDescription,
  ExtractorConfig,
  ExtractionResult,
} from '../types/node-description';

interface NodeModule {
  default?: any;
  [key: string]: any;
}

interface NodeInstance {
  description: Partial<CompleteNodeDescription>;
  methods?: {
    loadOptions?: Record<string, Function>;
    [key: string]: any;
  };
}

export abstract class BaseExtractor<TItems, TConfig> {
  protected tempDir: string;
  protected outputDir: string;
  protected verbose: boolean;
  protected extractedItems!: TItems;

  constructor(config?: ExtractorConfig) {
    this.tempDir = config?.tempDir || path.join(os.tmpdir(), 'extractor-' + Date.now());
    this.outputDir = config?.outputDir || process.cwd();
    this.verbose = config?.verbose || false;
  }

  /**
   * Log message if verbose is enabled
   */
  protected log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  async extract(config: TConfig): Promise<TItems> {
    try {
      await this.beforeExtract(config);
      const results = await this.extractInternal(config);
      this.extractedItems = results;
      await this.afterExtract();
      return results;
    } catch (error) {
      this.log(`Extraction error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  protected abstract extractInternal(config: TConfig): Promise<TItems>;

  protected async beforeExtract(config: TConfig): Promise<void> {
    // May need this in the future
  }

  protected async afterExtract(): Promise<void> {
    // May need this in the future
  }

  /**
   * Save results with metadata
   */
  async saveResults(filename: string, format: string): Promise<void> {
    const totalNodes = Array.isArray(this.extractedItems)
      ? this.extractedItems.length
      : typeof this.extractedItems === 'object' && this.extractedItems !== null
        ? Object.values(this.extractedItems).reduce(
            (sum: number, nodes: any) => sum + (Array.isArray(nodes) ? nodes.length : 0),
            0
          )
        : 0;

    const data: ExtractionResult<TItems> = {
      extractedAt: new Date().toISOString(),
      totalNodes,
      format,
      nodes: (Array.isArray(this.extractedItems)
        ? this.extractedItems
        : [this.extractedItems]) as any,
    };

    const filePath = path.join(this.outputDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 Saved descriptions to ${filePath}`);
  }

  /**
   * Clean up temporary files
   */
  protected async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      // Still ignore cleanup errors but log them in verbose mode
      this.log(
        `Cleanup error (safe to ignore): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get extracted items
   */
  getItems(): TItems {
    return this.extractedItems;
  }

  /**
   * Resolve node class from module exports
   */
  protected resolveNodeClass(nodeModule: any): any {
    if (nodeModule.default && typeof nodeModule.default === 'function') {
      return nodeModule.default;
    }

    // Try any function export
    for (const [key, value] of Object.entries(nodeModule)) {
      if (typeof value === 'function' && key !== 'default') {
        return value;
      }
    }

    return null;
  }

  /**
   * Process node icons and return icon information
   */
  protected processNodeIcons(
    description: any,
    packageName: string,
    filePath: string,
    packagePath: string
  ): { icon?: string; iconUrl?: string; iconLightUrl?: string; iconDarkUrl?: string } {
    const result: { icon?: string; iconUrl?: string; iconLightUrl?: string; iconDarkUrl?: string } =
      {};

    if (description.icon) {
      if (typeof description.icon === 'string') {
        if (description.icon.startsWith('fa:')) {
          result.icon = description.icon;
        } else {
          const iconPath = description.icon.startsWith('file:')
            ? description.icon.replace('file:', '')
            : description.icon;
          result.iconUrl = this.generateIconUrl(iconPath, packageName, filePath, packagePath);
        }
      } else if (
        typeof description.icon === 'object' &&
        (description.icon.light || description.icon.dark)
      ) {
        if (description.icon.light) {
          const iconLightPath = description.icon.light.startsWith('file:')
            ? description.icon.light.replace('file:', '')
            : description.icon.light;
          result.iconLightUrl = this.generateIconUrl(
            iconLightPath,
            packageName,
            filePath,
            packagePath
          );
        }
        if (description.icon.dark) {
          const iconDarkPath = description.icon.dark.startsWith('file:')
            ? description.icon.dark.replace('file:', '')
            : description.icon.dark;
          result.iconDarkUrl = this.generateIconUrl(
            iconDarkPath,
            packageName,
            filePath,
            packagePath
          );
          // If both light and dark are present, prefer dark for iconUrl
          result.iconUrl = result.iconDarkUrl;
        } else if (result.iconLightUrl) {
          // If only light is present, use it for iconUrl
          result.iconUrl = result.iconLightUrl;
        }
      }
    }

    if (description.iconUrl) {
      result.iconUrl = this.generateIconUrl(
        description.iconUrl,
        packageName,
        filePath,
        packagePath
      );
    }

    return result;
  }

  /**
   * Generate node name from original name and package name
   */
  protected generateNodeName(originalName: string, packageName: string): string {
    const cleanPackageName = packageName.replace(/^@[^/]+\//, '').replace(/^n8n-nodes-/, '');
    return `n8n-nodes-${cleanPackageName}.${originalName}`;
  }

  /**
   * Generate icon URL from icon path
   */
  protected generateIconUrl(
    iconPath: string,
    packageName: string,
    nodePath: string,
    packagePath: string
  ): string {
    const cleanPackageName = packageName.replace(/^@[^/]+\//, '');
    const nodeDir = path.dirname(nodePath);

    // Remove any leading "file:" prefix
    let normalizedIconPath = iconPath.startsWith('file:')
      ? iconPath.replace(/^file:/, '')
      : iconPath;

    // Resolve path based on different patterns
    let resolvedPath = normalizedIconPath;

    if (normalizedIconPath.startsWith('/')) {
      // Absolute path within package
      resolvedPath = normalizedIconPath.substring(1);
    } else if (
      !normalizedIconPath.includes('/') ||
      normalizedIconPath.startsWith('./') ||
      normalizedIconPath.startsWith('../')
    ) {
      // Relative path or just filename
      const absolutePath = path.resolve(nodeDir, normalizedIconPath);
      resolvedPath = path.relative(packagePath, absolutePath).replace(/\\/g, '/');
    }

    return `icons/${cleanPackageName}/${resolvedPath}`;
  }

  /**
   * Safely load a node module with timeout
   */
  protected async loadNodeModule(filePath: string, timeoutMs: number = 10000): Promise<NodeModule> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Module load timeout: ${filePath}`));
      }, timeoutMs);

      try {
        const resolvedPath = require.resolve(filePath);
        delete require.cache[resolvedPath];
        const module = require(filePath);
        clearTimeout(timeoutId);
        resolve(module);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Extract complete node description from a file
   */
  protected async extractCompleteNode(
    filePath: string,
    packageName: string,
    packagePath: string,
    nodeModulesPath: string
  ): Promise<CompleteNodeDescription | null> {
    try {
      this.log(`[${packageName}] 🔧 Extracting description from: ${path.basename(filePath)}`);

      // Setup module resolution
      const originalPaths = module.paths.slice();

      if (!module.paths.includes(nodeModulesPath)) {
        module.paths.unshift(nodeModulesPath);
      }

      try {
        // Load the module with timeout safety
        const nodeModule = await this.loadNodeModule(filePath);

        // Use the extracted method to get the node class
        const NodeClass = this.resolveNodeClass(nodeModule);

        if (!NodeClass || typeof NodeClass !== 'function') {
          this.log(`❌ No valid NodeClass found in ${path.basename(filePath)}`);
          return null;
        }

        // Create instance and get description
        const nodeInstance = new NodeClass();
        const description = nodeInstance.description;

        if (!description || !description.name) {
          this.log(`❌ No valid description in ${path.basename(filePath)}`);
          return null;
        }

        console.log(`✅ Extracted description for: ${description.displayName}`);

        // Return the COMPLETE description object
        const completeDescription: CompleteNodeDescription = {
          ...description,
          displayName: description.displayName,
          name: this.generateNodeName(description.name, packageName),
          group: description.group || [],
          version: description.version,
          description: description.description || '',
          defaults: description.defaults || {},
          inputs: description.inputs || ['main'],
          outputs: description.outputs || ['main'],
          properties: description.properties || [],
        };

        // Add load options methods if available
        if (nodeInstance.methods?.loadOptions) {
          completeDescription.__loadOptionsMethods = Object.keys(nodeInstance.methods.loadOptions);
        }

        // Process icons using the extracted method
        const iconInfo = this.processNodeIcons(description, packageName, filePath, packagePath);

        if (iconInfo.icon) {
          completeDescription.icon = iconInfo.icon;
          // If we're using a Font Awesome icon, remove any iconUrl
          if (iconInfo.icon.startsWith('fa:')) {
            delete completeDescription.iconUrl;
          }
        }

        if (iconInfo.iconUrl) {
          completeDescription.iconUrl = iconInfo.iconUrl;
        }

        if (iconInfo.iconLightUrl) {
          completeDescription.iconUrl = iconInfo.iconLightUrl;
        }
        if (iconInfo.iconDarkUrl) {
          completeDescription.iconUrl = iconInfo.iconDarkUrl;
        }

        return completeDescription;
      } finally {
        // Restore paths
        module.paths.splice(0, module.paths.length, ...originalPaths);
      }
    } catch (error) {
      this.log(
        `❌ Extraction error for ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
}
