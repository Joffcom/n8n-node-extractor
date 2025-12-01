import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseExtractor } from './base-extractor';
import { CompleteNodeDescription, ExtractorConfig } from '../types/node-description';
import { downloadAndExtractPackage } from '../utils/download-utils';
import { getDeclaredNodes, parsePackageName, setupN8nDependencies } from '../utils/npm-utils';

export class NodeExtractor extends BaseExtractor<CompleteNodeDescription[], string> {
  private packagePath: string = '';

  constructor(config?: ExtractorConfig) {
    super(config);
  }

  /**
   * Extract complete node descriptions from a community package
   */
  async extractInternal(config: string): Promise<CompleteNodeDescription[]> {
    const { name: packageName, version } = parsePackageName(config);
    console.log(`📦 Extracting node descriptions from: ${packageName}`);

    try {
      // Create temp directory
      await fs.mkdir(this.tempDir, { recursive: true });

      // Download and extract package
      this.packagePath = await downloadAndExtractPackage(packageName, this.tempDir, version);

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
        const packageNodeModules = path.join(this.packagePath, 'node_modules');
        const node = await this.extractCompleteNode(
          validPath.path,
          packageName,
          this.packagePath,
          packageNodeModules
        );
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
}
