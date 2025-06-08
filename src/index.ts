export { NodeExtractor } from './extractors/node-extractor';
export { CompleteNodeDescription } from './types/node-description';
export { main } from './cli';

// Allow usage as CLI
if (require.main === module) {
  import('./cli').then(cli => cli.main()).catch(console.error);
}
