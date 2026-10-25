import ts from 'typescript';
import { UIElement, createLocation } from '@craftlens/core';
import { HtmlParser } from '../html/html-parser.js';

export class JsxUIParser {
  /**
   * Traverses a TypeScript SourceFile containing JSX/TSX and extracts a tree of UIElements.
   */
  public static parse(sourceFile: ts.SourceFile, filePath: string): { roots: UIElement[]; all: UIElement[] } {
    const roots: UIElement[] = [];
    const all: UIElement[] = [];
    let idCounter = 1;

    function extractAttributes(opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement): Record<string, string> {
      const attributes: Record<string, string> = {};
      for (const prop of opening.attributes.properties) {
        if (ts.isJsxAttribute(prop)) {
          const name = prop.name.getText(sourceFile);
          let val = '';
          if (prop.initializer) {
            if (ts.isStringLiteral(prop.initializer)) {
              val = prop.initializer.text;
            } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
              val = prop.initializer.expression.getText(sourceFile);
            }
          }
          attributes[name] = val;
        }
      }
      return attributes;
    }

    function visitNode(node: ts.Node, parent?: UIElement, depth = 0): UIElement | null {
      if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) {
        return null;
      }

      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = opening.tagName.getText(sourceFile);
      const attributes = extractAttributes(opening);

      const rawClasses = attributes['className'] || attributes['class'] || '';
      const classes = rawClasses
        .replace(/["'{}`]/g, '')
        .split(/\s+/)
        .filter(Boolean);

      const rawStyle = attributes['style'] || '';
      const styles = HtmlParser.parseStyles(rawStyle, classes);

      const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      const range = createLocation(
        filePath,
        startPos.line + 1,
        startPos.character + 1,
        node.getStart(sourceFile),
        endPos.line + 1,
        endPos.character + 1,
        node.getEnd()
      );

      const element: UIElement = {
        id: `jsx_${idCounter++}_${tagName}`,
        type: 'unknown',
        file: filePath,
        tagName,
        classes,
        styles,
        attributes,
        children: [],
        depth,
        range,
        parent,
        parentId: parent ? parent.id : undefined,
      };

      // Extract text content if present
      if (ts.isJsxElement(node)) {
        const textParts: string[] = [];
        for (const child of node.children) {
          if (ts.isJsxText(child)) {
            const t = child.getText(sourceFile).trim();
            if (t) textParts.push(t);
          }
        }
        if (textParts.length > 0) {
          element.content = textParts.join(' ');
        }
      }

      element.type = HtmlParser.classifyType(element);
      element.visualTreatmentScore = HtmlParser.calculateVisualTreatmentScore(element);

      all.push(element);

      // Process children
      if (ts.isJsxElement(node)) {
        for (const child of node.children) {
          if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
            const childEl = visitNode(child, element, depth + 1);
            if (childEl) {
              element.children.push(childEl);
            }
          }
        }
      }

      return element;
    }

    function searchTree(node: ts.Node): void {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const el = visitNode(node, undefined, 0);
        if (el) {
          roots.push(el);
          return; // Children are traversed recursively in visitNode
        }
      }
      ts.forEachChild(node, searchTree);
    }

    searchTree(sourceFile);

    return { roots, all };
  }
}
