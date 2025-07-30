import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Setup n8n dependencies in package directory
 */
export async function setupN8nDependencies(packagePath: string): Promise<void> {
  try {
    console.log(`📦 Setting up n8n dependencies...`);

    const packageJsonPath = path.join(packagePath, 'package.json');
    let packageJson: any = {};

    try {
      packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    } catch {
      packageJson = { name: 'temp', version: '1.0.0' };
    }

    // Add n8n dependencies
    if (!packageJson.dependencies) packageJson.dependencies = {};
    packageJson.dependencies['n8n-workflow'] = 'latest';
    packageJson.dependencies['n8n-core'] = 'latest';

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Install
    execSync('npm install --no-save --silent --legacy-peer-deps', {
      cwd: packagePath,
      stdio: 'pipe',
    });

    console.log(`✅ Dependencies ready`);
  } catch (error) {
    console.warn(`⚠️  Could not setup dependencies:`, error);
  }
}

/**
 * Get declared nodes from package.json
 */
export async function getDeclaredNodes(packagePath: string): Promise<string[]> {
  try {
    const packageJsonPath = path.join(packagePath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    if (packageJson.n8n?.nodes) {
      return packageJson.n8n.nodes;
    }

    return [];
  } catch {
    return [];
  }
}
