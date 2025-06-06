#!/usr/bin/env node

import { NodeExtractor } from './extractors/node-extractor';

/**
 * CLI interface
 */
export async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: pnpm dev <package-name> [options]

Examples:
  pnpm dev n8n-nodes-badges
  pnpm dev n8n-nodes-digital-ocean
  pnpm dev @n8n-community/n8n-nodes-supabase

Options:
  --verbose      Show detailed logs
  --output=DIR   Set output directory (default: current)

This will extract the node descriptions in the same format
as n8n's /types/nodes.json endpoint.
    `);
    process.exit(1);
  }

  const packageName = args[0];
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
  
  const extractor = new NodeExtractor({ verbose, outputDir });
  
  try {
    await extractor.extract(packageName);
    extractor.printSummary();
    
    // Save complete format
    const filename = `${packageName.replace(/[@\/]/g, '-')}.json`;
    await extractor.saveResults(filename, 'node-descriptions');
    
    console.log('\n🎉 Extraction finished!');
    console.log(`📄 File saved: ${filename}`);
    
  } catch (error: any) {
    console.error('❌ Extraction failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}