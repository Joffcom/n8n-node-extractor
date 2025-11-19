import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { BaseExtractor } from './base-extractor';
import { CompleteNodeDescription, ExtractorConfig } from '../types/node-description';
import { getDeclaredNodes, parsePackageName } from '../utils/npm-utils';

export class MultipleNodeExtractor extends BaseExtractor<
  Record<string, CompleteNodeDescription[]>,
  string[]
> {
  private packagePaths: Map<string, string> = new Map();

  constructor(config?: ExtractorConfig) {
    super(config);
  }

  /**
   * Extract complete node descriptions from multiple community packages
   */
  protected async extractInternal(
    config: string[]
  ): Promise<Record<string, CompleteNodeDescription[]>> {
    const packageNames = config;
    console.log(
      `📦 Extracting node descriptions from ${packageNames.length} packages: ${packageNames.join(', ')}`
    );

    try {
      // Create temp directory
      await fs.mkdir(this.tempDir, { recursive: true });

      // Create a single project with all packages
      const projectPath = path.join(this.tempDir, 'project');
      await fs.mkdir(projectPath, { recursive: true });

      // Create package.json with all dependencies
      const packageJson: any = {
        name: 'n8n-multi-extractor',
        version: '1.0.0',
        dependencies: {
          'n8n-workflow': 'latest',
          'n8n-core': 'latest',
        },
      };

      // Add all packages as dependencies
      for (const packageName of packageNames) {
        const { name, version } = parsePackageName(packageName);
        packageJson.dependencies[name] = version;
      }

      this.log('Project package.json: ' + JSON.stringify(packageJson, null, 2));

      await fs.writeFile(
        path.join(projectPath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Install all dependencies with a single npm install
      console.log(`📦 Installing dependencies (this may take a while)...`);
      execSync('npm install --no-save --silent --legacy-peer-deps', {
        cwd: projectPath,
        stdio: 'pipe',
      });
      console.log(`✅ Dependencies installed`);

      // Process all packages in parallel
      const results: Record<string, CompleteNodeDescription[]> = {};
      const extractPromises = packageNames
        .map(parsePackageName)
        .map(async ({ name: packageName }) => {
          const packagePath = path.join(projectPath, 'node_modules', packageName);
          const nodes = await this.findNodes(packageName, packagePath, projectPath);
          results[packageName] = nodes;
          console.log(`✅ Extracted ${nodes.length} nodes from ${packageName}`);
        });

      await Promise.all(extractPromises);

      this.extractedItems = results;
      const totalNodes = Object.values(results).reduce((sum, nodes) => sum + nodes.length, 0);
      console.log(
        `✅ Found ${totalNodes} total node descriptions across ${packageNames.length} packages`
      );

      return results;
    } catch (error) {
      console.error(`❌ Extraction failed:`, error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Find nodes in a package
   */
  private async findNodes(
    packageName: string,
    packagePath: string,
    projectPath: string
  ): Promise<CompleteNodeDescription[]> {
    // Get declared nodes from package.json
    const declaredNodes = await getDeclaredNodes(packagePath);
    this.log(`[${packageName}] 🔍 Found ${JSON.stringify(declaredNodes)}`);
    // Process nodes in parallel using Promise.all
    const nodePromises = declaredNodes.map(async nodePath => {
      this.log(`[${packageName}] 🔍 Processing: ${nodePath}`);

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
          const fullPath = path.resolve(packagePath, variation);
          this.log(`[${packageName}] 🔍 Checking: ${fullPath}`);
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
      this.log(`[${packageName}] 🔍 Valid path: ${validPath?.path}`);
      if (validPath) {
        const projectNodeModules = path.join(projectPath, 'node_modules');
        const node = await this.extractCompleteNode(
          validPath.path,
          packageName,
          packagePath,
          projectNodeModules
        );
        if (node) {
          return node;
        }
      }

      console.warn(`❌ Could not extract: ${nodePath} from ${packageName}`);
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
    if (Object.keys(this.extractedItems).length === 0) {
      console.log('\n❌ No nodes found');
      return;
    }

    console.log('\n📊 Node Descriptions Extracted:');
    let index = 1;
    for (const [packageName, nodes] of Object.entries(this.extractedItems)) {
      console.log(`\n📦 Package: ${packageName} (${nodes.length} nodes)`);
      nodes.forEach(node => {
        console.log(`  ${index}. ${node.displayName} (${node.name})`);
        console.log(`     Description: ${node.description}`);
        console.log(`     Groups: ${node.group.join(', ')}`);
        console.log(`     Version: ${node.version}`);
        console.log(`     Properties: ${node.properties.length}`);
        console.log(`     Credentials: ${node.credentials?.length || 0}`);
        console.log(`     Webhooks: ${node.webhooks ? 'Yes' : 'No'}`);
        console.log(`     Load Options: ${node.__loadOptionsMethods?.length || 0}`);

        if (node.icon) {
          console.log(`     Icon: ${node.icon}`);
        }
        if (node.iconUrl) {
          console.log(`     Icon URL: ${node.iconUrl}`);
        }
        index++;
      });
    }
  }

  /**
   * Save results with metadata in key-value format
   */
  async saveResults(filename: string): Promise<void> {
    const data = {
      extractedAt: new Date().toISOString(),
      totalPackages: Object.keys(this.extractedItems).length,
      totalNodes: Object.values(this.extractedItems).reduce((sum, nodes) => sum + nodes.length, 0),
      format: 'node-descriptions',
      packages: this.extractedItems,
    };

    const filePath = path.join(this.outputDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 Saved descriptions to ${filePath}`);
  }
}
