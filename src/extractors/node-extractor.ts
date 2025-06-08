import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseExtractor } from './base-extractor';
import { CompleteNodeDescription, ExtractorConfig } from '../types/node-description';
import { downloadAndExtractPackage } from '../utils/download-utils';
import { getDeclaredNodes, setupN8nDependencies } from '../utils/npm-utils';

export class NodeExtractor extends BaseExtractor<CompleteNodeDescription> {
  private packagePath: string = '';

  constructor(config?: ExtractorConfig) {
    super(config);
  }

  /**
   * Extract complete node descriptions from a community package
   */
  async extract(packageName: string): Promise<CompleteNodeDescription[]> {
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
    const nodes: CompleteNodeDescription[] = [];

    // Get declared nodes from package.json
    const declaredNodes = await getDeclaredNodes(this.packagePath);

    for (const nodePath of declaredNodes) {
      console.log(`🔍 Processing: ${nodePath}`);

      // Try exact path and variations
      const variations = [
        nodePath,
        nodePath.replace('.ts', '.js'),
        nodePath.replace('src/', 'dist/'),
        nodePath.replace('src/', 'lib/'),
      ];

      let found = false;
      for (const variation of variations) {
        const fullPath = path.resolve(this.packagePath, variation);
        try {
          await fs.access(fullPath);
          const node = await this.extractCompleteNode(fullPath, packageName);
          if (node) {
            nodes.push(node);
            found = true;
            break;
          }
        } catch {
          // File doesn't exist
        }
      }

      if (!found) {
        console.warn(`❌ Could not extract: ${nodePath}`);
      }
    }

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
        // Clear cache and require
        const resolvedPath = require.resolve(filePath);
        delete require.cache[resolvedPath];

        const nodeModule = require(filePath);

        // Get the class - try different export patterns
        let NodeClass = null;

        if (nodeModule.default && typeof nodeModule.default === 'function') {
          NodeClass = nodeModule.default;
        } else {
          // Try any function export
          for (const [key, value] of Object.entries(nodeModule)) {
            if (typeof value === 'function' && key !== 'default') {
              NodeClass = value as any;
              break;
            }
          }
        }

        if (!NodeClass || typeof NodeClass !== 'function') {
          this.log(`❌ No valid NodeClass found`);
          return null;
        }

        // Create instance and get description
        const nodeInstance = new NodeClass();
        const description = nodeInstance.description;

        if (!description || !description.name) {
          this.log(`❌ No valid description`);
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
        // Add load options methods
        if (nodeInstance.methods?.loadOptions) {
          completeDescription.__loadOptionsMethods = Object.keys(nodeInstance.methods.loadOptions);
        }

        // Handle icon path - generate proper iconUrl
        if (description.icon) {
          // Only Font Awesome icons stay as 'icon'
          if (description.icon.startsWith('fa:')) {
            completeDescription.icon = description.icon;
          } else {
            // All other icons (including file: references) become iconUrl
            const iconPath = description.icon.startsWith('file:')
              ? description.icon.replace('file:', '')
              : description.icon;

            completeDescription.iconUrl = this.generateIconUrl(iconPath, packageName, filePath);
            // Remove the original icon field since we're using iconUrl
            delete completeDescription.icon;
          }
        }

        // If there's already an iconUrl, update it
        if (description.iconUrl) {
          completeDescription.iconUrl = this.generateIconUrl(
            description.iconUrl,
            packageName,
            filePath
          );
        }

        return completeDescription;
      } finally {
        // Restore paths
        module.paths.splice(0, module.paths.length, ...originalPaths);
      }
    } catch (error) {
      console.log(`❌ Extraction error:`, error);
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

  private generateNodeName(originalName: string, packageName: string): string {
    const cleanPackageName = packageName.replace(/^@[^/]+\//, '').replace(/^n8n-nodes-/, '');
    return `n8n-nodes-${cleanPackageName}.${originalName}`;
  }

  private generateIconUrl(iconPath: string, packageName: string, nodePath: string): string {
    const cleanPackageName = packageName.replace(/^@[^/]+\//, '');

    let resolvedIconPath = iconPath;

    if (iconPath.startsWith('./') || iconPath.startsWith('../')) {
      const nodeDir = path.dirname(nodePath);
      const absoluteIconPath = path.resolve(nodeDir, iconPath);
      resolvedIconPath = path.relative(this.packagePath, absoluteIconPath).replace(/\\/g, '/');
    } else if (iconPath.startsWith('/')) {
      resolvedIconPath = iconPath.substring(1);
    } else if (!iconPath.includes('/')) {
      const nodeDir = path.dirname(nodePath);
      const absoluteIconPath = path.resolve(nodeDir, iconPath);
      resolvedIconPath = path.relative(this.packagePath, absoluteIconPath).replace(/\\/g, '/');
    } else {
      resolvedIconPath = iconPath;
    }

    return `icons/${cleanPackageName}/${resolvedIconPath}`;
  }
}
