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
    
    // Add n8n dependencies (move peerDependencies to dependencies for installation)
    if (!packageJson.dependencies) packageJson.dependencies = {};

    // Copy peerDependencies to dependencies
    if (packageJson.peerDependencies) {
      Object.assign(packageJson.dependencies, packageJson.peerDependencies);
    }

    // Ensure core n8n packages are present
    if (!packageJson.dependencies['n8n-workflow']) {
      packageJson.dependencies['n8n-workflow'] = 'latest';
    }
    if (!packageJson.dependencies['n8n-core']) {
      packageJson.dependencies['n8n-core'] = 'latest';
    }

    // Remove devDependencies to avoid installing them in production mode
    delete packageJson.devDependencies;

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Install
    execSync('npm install --no-save --omit=dev', {
      cwd: packagePath,
      stdio: 'inherit'
    });

    console.log(`✅ Dependencies ready`);
    
  } catch (error: any) {
    console.warn(`⚠️  Could not setup dependencies:`, error.message);
    // Try to get more details about the npm error
    if (error.stderr) {
      console.warn('npm stderr:', error.stderr.toString());
    }
    if (error.stdout) {
      console.warn('npm stdout:', error.stdout.toString());
    }
    throw error; // Re-throw to stop execution
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
