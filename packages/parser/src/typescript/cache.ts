import { ParsedDocument, parseSource } from './parser.js';

export interface CacheEntry {
  document: ParsedDocument;
  version?: number;
  hash: string;
  timestamp: number;
}

export class AstCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;

  constructor(maxEntries: number = 200) {
    this.maxEntries = maxEntries;
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    return `${content.length}:${hash}`;
  }

  public getOrParse(filePath: string, sourceText: string, version?: number): { document: ParsedDocument; fromCache: boolean } {
    const hash = this.simpleHash(sourceText);
    const existing = this.cache.get(filePath);

    if (existing && existing.hash === hash) {
      if (version === undefined || existing.version === version) {
        return { document: existing.document, fromCache: true };
      }
    }

    const document = parseSource(filePath, sourceText);
    this.cache.set(filePath, {
      document,
      version,
      hash,
      timestamp: Date.now(),
    });

    if (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    return { document, fromCache: false };
  }

  public invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}
