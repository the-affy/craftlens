import ts from 'typescript';
import { UIElement, UIElementType } from '@craftlens/core';
import { HtmlParser } from '../html/html-parser.js';
import { JsxUIParser } from '../jsx/jsx-ui-parser.js';
import { parseSource } from '../typescript/parser.js';

export interface ParsedUIDocument {
  filePath: string;
  roots: UIElement[];
  all: UIElement[];
  rawSource: string;
  documentType: 'html' | 'jsx' | 'tsx' | 'vue' | 'svelte';
  findElementsByType(type: UIElementType): UIElement[];
  findElementsByTag(tagName: string): UIElement[];
  findElementById(id: string): UIElement | undefined;
}

export class UnifiedUIParser {
  public static parse(filePath: string, sourceText: string, existingSourceFile?: ts.SourceFile): ParsedUIDocument {
    const lower = filePath.toLowerCase();
    let roots: UIElement[] = [];
    let all: UIElement[] = [];
    let documentType: 'html' | 'jsx' | 'tsx' | 'vue' | 'svelte' = 'html';

    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      documentType = 'html';
      const result = HtmlParser.parse(filePath, sourceText);
      roots = result.roots;
      all = result.all;
    } else if (lower.endsWith('.vue')) {
      documentType = 'vue';
      // Extract template portion if vue SFC
      const templateMatch = sourceText.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
      const templateContent = templateMatch ? templateMatch[1] : sourceText;
      const result = HtmlParser.parse(filePath, templateContent);
      roots = result.roots;
      all = result.all;
    } else if (lower.endsWith('.svelte')) {
      documentType = 'svelte';
      const result = HtmlParser.parse(filePath, sourceText);
      roots = result.roots;
      all = result.all;
    } else {
      // TSX / JSX / JS / TS
      documentType = lower.endsWith('.tsx') ? 'tsx' : 'jsx';
      const sourceFile = existingSourceFile || parseSource(filePath, sourceText).sourceFile;
      const result = JsxUIParser.parse(sourceFile, filePath);
      roots = result.roots;
      all = result.all;
    }

    const byId = new Map<string, UIElement>();
    for (const el of all) {
      byId.set(el.id, el);
    }

    return {
      filePath,
      roots,
      all,
      rawSource: sourceText,
      documentType,
      findElementsByType(type: UIElementType): UIElement[] {
        return all.filter(el => el.type === type);
      },
      findElementsByTag(tagName: string): UIElement[] {
        const lowerTag = tagName.toLowerCase();
        return all.filter(el => el.tagName.toLowerCase() === lowerTag);
      },
      findElementById(id: string): UIElement | undefined {
        return byId.get(id);
      },
    };
  }
}
