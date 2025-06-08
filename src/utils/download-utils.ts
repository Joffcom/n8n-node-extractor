import * as https from 'https';
import { createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as tar from 'tar';
import { PackageInfo } from '../types/node-description';

/**
 * Download a file from URL to local destination
 */
export async function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destination);
    https
      .get(url, response => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', reject);
  });
}

/**
 * Get package info from npm registry
 */
export async function getPackageInfo(packageName: string): Promise<PackageInfo> {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`
  );
  if (!response.ok) {
    throw new Error(`Package not found: ${packageName} (${response.status})`);
  }
  return (await response.json()) as PackageInfo;
}

/**
 * Download and extract npm package
 */
export async function downloadAndExtractPackage(
  packageName: string,
  tempDir: string
): Promise<string> {
  const packageInfo = await getPackageInfo(packageName);
  console.log(`📋 Package version: ${packageInfo.version}`);

  const downloadPath = path.join(tempDir, 'package.tgz');
  await downloadFile(packageInfo.dist.tarball, downloadPath);

  const extractPath = path.join(tempDir, 'extracted');
  await fs.mkdir(extractPath, { recursive: true });

  await tar.extract({
    file: downloadPath,
    cwd: extractPath,
    strip: 1,
  });

  return extractPath;
}
