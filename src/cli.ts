#!/usr/bin/env node

import { NodeExtractor } from './extractors/node-extractor';
import { MultipleNodeExtractor } from './extractors/multiple-node-extractor';
import * as fs from 'fs/promises';

/**
 * CLI interface
 */
export async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: pnpm dev <package-name> [options]
       pnpm dev <package1,package2,...> [options]

Examples:
  pnpm dev n8n-nodes-badges
  pnpm dev n8n-nodes-digital-ocean
  pnpm dev @n8n-community/n8n-nodes-supabase
  pnpm dev n8n-nodes-tavily,n8n-nodes-badges
  pnpm dev @n8n-community/n8n-nodes-supabase,n8n-nodes-digital-ocean

Options:
  --verbose      Show detailed logs
  --output=DIR   Set output directory (default: current)

This will extract the node descriptions in the same format
as n8n's /types/nodes.json endpoint.

For multiple packages, the output will be a key-value JSON
where keys are package names.
    `);
    process.exit(1);
  }

  const packageArg = args[0];
  let verbose = false;
  let outputDir = process.cwd();

  // Parse options
  args.slice(1).forEach(arg => {
    if (arg === '--verbose') {
      verbose = true;
    } else if (arg.startsWith('--output=')) {
      outputDir = arg.split('=')[1];
    }
  });

  let packageNames: string[] = [];
  const isFile = packageArg.endsWith('.json');
  if (isFile) {
    const data = JSON.parse(await fs.readFile(packageArg, 'utf8'));
    packageNames = data;
  } else {
    packageNames = packageArg
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  if (packageNames.length === 0) {
    console.error('❌ No valid package names provided');
    process.exit(1);
  }

  try {
    if (packageNames.length === 1) {
      // Single package - use original extractor
      const packageName = packageNames[0];
      const extractor = new NodeExtractor({ verbose, outputDir });

      await extractor.extract(packageName);
      extractor.printSummary();

      // Save complete format
      const filename = `${packageName.replace(/[@\/]/g, '')}.json`;
      await extractor.saveResults(filename, 'node-descriptions');

      console.log('\n🎉 Extraction finished!');
      console.log(`📄 File saved: ${filename}`);
    } else {
      // Multiple packages - use multiple extractor
      const extractor = new MultipleNodeExtractor({ verbose, outputDir });

      await extractor.extract(packageNames);
      extractor.printSummary();

      // Save in key-value format
      const filename = `multiple-packages.json`;
      await extractor.saveResults(filename);

      console.log('\n🎉 Extraction finished!');
      console.log(`📄 File saved: ${filename}`);
      console.log(`📦 Processed ${packageNames.length} packages`);
    }
  } catch (error: any) {
    console.error('❌ Extraction failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
