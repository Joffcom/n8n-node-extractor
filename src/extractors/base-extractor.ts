import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ExtractorConfig, ExtractionResult } from '../types/node-description';

export abstract class BaseExtractor<T> {
  protected tempDir: string;
  protected outputDir: string;
  protected verbose: boolean;
  protected extractedItems: T[] = [];

  constructor(config?: ExtractorConfig) {
    this.tempDir = config?.tempDir || path.join(os.tmpdir(), 'extractor-' + Date.now());
    this.outputDir = config?.outputDir || process.cwd();
    this.verbose = config?.verbose || false;
  }

  /**
   * Log message if verbose is enabled
   */
  protected log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Main extract method to be implemented by subclasses
   */
  abstract extract(packageName: string): Promise<T[]>;

  /**
   * Save results with metadata
   */
  async saveResults(filename: string, format: string): Promise<void> {
    const data: ExtractionResult = {
      extractedAt: new Date().toISOString(),
      totalNodes: this.extractedItems.length,
      format,
      nodes: this.extractedItems as any,
    };
    
    const filePath = path.join(this.outputDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 Saved descriptions to ${filePath}`);
  }

  /**
   * Clean up temporary files
   */
  protected async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Get extracted items
   */
  getItems(): T[] {
    return this.extractedItems;
  }
}