import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseExtractor } from './base-extractor';
import { CompleteNodeDescription, ExtractorConfig } from '../types/node-description';
import { downloadAndExtractPackage } from '../utils/download-utils';
import { getDeclaredNodes, setupN8nDependencies } from '../utils/npm-utils';

// Type definitions for better type safety
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

export class NodeExtractor extends BaseExtractor<CompleteNodeDescription> {
  private packagePath: string = '';

  constructor(config?: ExtractorConfig) {
    super(config);
  }

  /**
   * Extract complete node descriptions from a community package
   */
  async extractInternal(packageName: string): Promise<CompleteNodeDescription[]> {
    console.log(`📦 Extracting node descriptions from: ${packageName}`);

    try {
      // Create temp directory
      await fs.mkdir(this.tempDir, { recursive: true });

      // Download and extract package
      this.packagePath = await downloadAndExtractPackage(packageName, this.tempDir);

      // Setup n8n dependencies
      await setupN8nDependencies(this.packagePath);

      // Find and process nodes
      const nodes = await this.findNodes(packageName);

      this.extractedItems = nodes;
      console.log(`✅ Found ${nodes.length} node descriptions`);

      return nodes;
    } catch (error) {
      console.error(`❌ Extraction failed:`, error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Find nodes in the package
   */
  private async findNodes(packageName: string): Promise<CompleteNodeDescription[]> {
    // Get declared nodes from package.json
    const declaredNodes = await getDeclaredNodes(this.packagePath);

    // Process nodes in parallel using Promise.all
    const nodePromises = declaredNodes.map(async nodePath => {
      console.log(`🔍 Processing: ${nodePath}`);

      // Generate path variations
      const variations = [
        nodePath,
        nodePath.replace('.ts', '.js'),
        nodePath.replace('src/', 'dist/'),
        nodePath.replace('src/', 'lib/'),
      ];

      // Check all variations in parallel
      const checkResults = await Promise.all(
        variations.map(async variation => {
          const fullPath = path.resolve(this.packagePath, variation);
          try {
            await fs.access(fullPath);
            return { exists: true, path: fullPath };
          } catch {
            return { exists: false, path: fullPath };
          }
        })
      );

      // Find the first valid path
      const validPath = checkResults.find(result => result.exists);

      if (validPath) {
        const node = await this.extractCompleteNode(validPath.path, packageName);
        if (node) {
          return node;
        }
      }

      console.warn(`❌ Could not extract: ${nodePath}`);
      return null;
    });

    // Filter out null results
    const nodes = (await Promise.all(nodePromises)).filter(
      node => node !== null
    ) as CompleteNodeDescription[];

    return nodes;
  }

  /**
   * Extract complete node description
   */
  private async extractCompleteNode(
    filePath: string,
    packageName: string
  ): Promise<CompleteNodeDescription | null> {
    try {
      this.log(`🔧 Extracting description from: ${path.basename(filePath)}`);

      // Setup module resolution
      const packageNodeModules = path.join(this.packagePath, 'node_modules');
      const originalPaths = module.paths.slice();

      if (!module.paths.includes(packageNodeModules)) {
        module.paths.unshift(packageNodeModules);
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
        const iconInfo = this.processNodeIcons(description, packageName, filePath);

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

  /**
   * Print summary of extracted nodes
   */
  printSummary(): void {
    if (this.extractedItems.length === 0) {
      console.log('\n❌ No nodes found');
      return;
    }

    console.log('\n📊 Node Descriptions Extracted:');
    this.extractedItems.forEach((node, index) => {
      console.log(`\n${index + 1}. ${node.displayName} (${node.name})`);
      console.log(`   Description: ${node.description}`);
      console.log(`   Groups: ${node.group.join(', ')}`);
      console.log(`   Version: ${node.version}`);
      console.log(`   Properties: ${node.properties.length}`);
      console.log(`   Credentials: ${node.credentials?.length || 0}`);
      console.log(`   Webhooks: ${node.webhooks ? 'Yes' : 'No'}`);
      console.log(`   Load Options: ${node.__loadOptionsMethods?.length || 0}`);

      if (node.icon) {
        console.log(`   Icon: ${node.icon}`);
      }
      if (node.iconUrl) {
        console.log(`   Icon URL: ${node.iconUrl}`);
      }
    });
  }

  private resolveNodeClass(nodeModule: any): any {
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

  private processNodeIcons(
    description: any,
    packageName: string,
    filePath: string
  ): { icon?: string; iconUrl?: string; iconLightUrl?: string; iconDarkUrl?: string } {
    const result: { icon?: string; iconUrl?: string; iconLightUrl?: string; iconDarkUrl?: string } = {};
  
    if (description.icon) {
      if (typeof description.icon === 'string') {
        if (description.icon.startsWith('fa:')) {
          result.icon = description.icon;
        } else {
          const iconPath = description.icon.startsWith('file:')
            ? description.icon.replace('file:', '')
            : description.icon;
          result.iconUrl = this.generateIconUrl(iconPath, packageName, filePath);
        }
      } else if (typeof description.icon === 'object' && (description.icon.light || description.icon.dark)) {
        if (description.icon.light) {
          const iconLightPath = description.icon.light.startsWith('file:')
            ? description.icon.light.replace('file:', '')
            : description.icon.light;
          result.iconLightUrl = this.generateIconUrl(iconLightPath, packageName, filePath);
        }
        if (description.icon.dark) {
          const iconDarkPath = description.icon.dark.startsWith('file:')
            ? description.icon.dark.replace('file:', '')
            : description.icon.dark;
          result.iconDarkUrl = this.generateIconUrl(iconDarkPath, packageName, filePath);
          // If both light and dark are present, prefer dark for iconUrl
          result.iconUrl = result.iconDarkUrl;
        } else if (result.iconLightUrl) {
          // If only light is present, use it for iconUrl
          result.iconUrl = result.iconLightUrl;
        }
      }
    }
  
    if (description.iconUrl) {
      result.iconUrl = this.generateIconUrl(description.iconUrl, packageName, filePath);
    }
  
    return result;
  }

  private generateNodeName(originalName: string, packageName: string): string {
    const cleanPackageName = packageName.replace(/^@[^/]+\//, '').replace(/^n8n-nodes-/, '');
    return `n8n-nodes-${cleanPackageName}.${originalName}`;
  }

  private generateIconUrl(iconPath: string, packageName: string, nodePath: string): string {
    const cleanPackageName = packageName.replace(/^@[^/]+\//, '');
    const nodeDir = path.dirname(nodePath);
  
    // Remove any leading "file:" prefix
    let normalizedIconPath = iconPath.startsWith('file:') ? iconPath.replace(/^file:/, '') : iconPath;
  
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
      resolvedPath = path.relative(this.packagePath, absolutePath).replace(/\\/g, '/');
    }
  
    return `icons/${cleanPackageName}/${resolvedPath}`;
  }

  /**
   * Safely load a node module with timeout
   */
  private async loadNodeModule(filePath: string, timeoutMs: number = 10000): Promise<NodeModule> {
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
}
