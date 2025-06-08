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

  async extract(packageName: string): Promise<T[]> {
    try {
      await this.beforeExtract(packageName);
      const results = await this.extractInternal(packageName);
      this.extractedItems = results;
      await this.afterExtract();
      return results;
    } catch (error) {
      this.log(`Extraction error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  protected abstract extractInternal(packageName: string): Promise<T[]>;

  protected async beforeExtract(packageName: string): Promise<void> {
    // May need this in the future
  }

  protected async afterExtract(): Promise<void> {
    // May need this in the future
  }

  /**
   * Save results with metadata
   */
  async saveResults(filename: string, format: string): Promise<void> {
    const data: ExtractionResult<T> = {
      extractedAt: new Date().toISOString(),
      totalNodes: this.extractedItems.length,
      format,
      nodes: this.extractedItems,
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
    } catch (error) {
      // Still ignore cleanup errors but log them in verbose mode
      this.log(
        `Cleanup error (safe to ignore): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get extracted items
   */
  getItems(): T[] {
    return this.extractedItems;
  }
}
