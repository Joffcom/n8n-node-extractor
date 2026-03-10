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

    // Remove lifecycle scripts from the root package to prevent issues like
    // husky hooks failing, while still allowing native addons in dependencies
    // (e.g. isolated-vm) to compile their binaries via their own install scripts
    delete packageJson.scripts;

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    execSync('npm install --no-save --omit=dev', {
      cwd: packagePath,
      stdio: 'inherit',
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

export interface N8nPackageConfig {
  nodes: string[];
  aiNodeSdkVersion?: number;
}

/**
 * Get n8n config from package.json (declared nodes and optional aiNodeSdkVersion)
 */
export async function getN8nPackageConfig(packagePath: string): Promise<N8nPackageConfig> {
  try {
    const packageJsonPath = path.join(packagePath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const n8n = packageJson.n8n;

    const config: N8nPackageConfig = {
      nodes: n8n?.nodes ?? [],
    };

    const version = n8n?.aiNodeSdkVersion;
    if (typeof version === 'number' && Number.isInteger(version) && version > 0) {
      config.aiNodeSdkVersion = version;
    }

    return config;
  } catch {
    return { nodes: [] };
  }
}

export function parsePackageName(packageName: string): { name: string; version: string } {
  const match = packageName.match(/(@?.+)@(.+)/);
  if (match) {
    const [, name, version] = match;
    return { name, version };
  }
  return { name: packageName, version: 'latest' };
}
