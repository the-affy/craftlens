import ts from 'typescript';
import { ParsedDocument } from '@craftlens/parser';
import { RecommendationAlternative, SourceLocation } from '@craftlens/core';

export interface ExcessiveCardsFinding {
  containerNode: ts.Node;
  cardNodes: ts.Node[];
  cardCount: number;
  location: SourceLocation;
}

export interface NestedCardFinding {
  outerCard: ts.Node;
  innerCard: ts.Node;
  location: SourceLocation;
}

export class SurfaceHierarchyAnalyzer {
  private static isCardNode(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return false;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tagName = opening.tagName.getText(sourceFile);

    if (tagName === 'Card' || tagName.endsWith('Card') || tagName === 'Surface') {
      return true;
    }

    // Also check div with card classes
    if (tagName === 'div') {
      for (const prop of opening.attributes.properties) {
        if (ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'className' && prop.initializer) {
          if (ts.isStringLiteral(prop.initializer)) {
            const cls = prop.initializer.text;
            if (
              (cls.includes('rounded-') && cls.includes('border') && cls.includes('bg-')) ||
              cls.includes('card')
            ) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Detect excessive card usage (CP-007)
   */
  public static findExcessiveCards(parsed: ParsedDocument, threshold = 4): ExcessiveCardsFinding[] {
    const sourceFile = parsed.sourceFile;
    if (!sourceFile) return [];

    const findings: ExcessiveCardsFinding[] = [];

    function inspectContainer(container: ts.JsxElement): void {
      const cards: ts.Node[] = [];
      let mappedCardFound: ts.Node | null = null;

      for (const child of container.children) {
        if (SurfaceHierarchyAnalyzer.isCardNode(child, sourceFile)) {
          cards.push(child);
        } else if (ts.isJsxExpression(child) && child.expression) {
          const exprText = child.expression.getText(sourceFile);
          if (
            exprText.includes('.map(') &&
            (exprText.includes('Card') || (exprText.includes('rounded') && exprText.includes('border')))
          ) {
            mappedCardFound = child;
          }
        }
      }

      if (cards.length >= threshold) {
        findings.push({
          containerNode: container,
          cardNodes: cards,
          cardCount: cards.length,
          location: parsed.getLocation(container.openingElement),
        });
      } else if (mappedCardFound) {
        const openingText = container.openingElement.getText(sourceFile);
        if (openingText.includes('grid') || openingText.includes('gap-')) {
          findings.push({
            containerNode: container,
            cardNodes: [mappedCardFound],
            cardCount: 8,
            location: parsed.getLocation(container.openingElement),
          });
        }
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxElement(node)) {
        inspectContainer(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  }


  /**
   * Detect nested cards (CP-008)
   */
  public static findNestedCards(parsed: ParsedDocument): NestedCardFinding[] {
    const sourceFile = parsed.sourceFile;
    if (!sourceFile) return [];

    const findings: NestedCardFinding[] = [];

    function checkInner(outer: ts.Node, current: ts.Node): void {
      for (const child of current.getChildren(sourceFile)) {
        if (SurfaceHierarchyAnalyzer.isCardNode(child, sourceFile)) {
          findings.push({
            outerCard: outer,
            innerCard: child,
            location: parsed.getLocation(child),
          });
          // Do not recurse further inside nested card
          continue;
        }
        checkInner(outer, child);
      }
    }

    function visit(node: ts.Node): void {
      if (SurfaceHierarchyAnalyzer.isCardNode(node, sourceFile)) {
        // Look for nested cards inside this card
        if (ts.isJsxElement(node)) {
          for (const child of node.children) {
            checkInner(node, child);
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  }

  public static getExcessiveCardAlternatives(): RecommendationAlternative[] {
    return [
      {
        id: 'compact-list',
        title: 'Option A — Compact List',
        description: 'Convert secondary and repetitive items into a clean, scannable data list or table.',
        whenToUse: 'Best for dense information, operational tables, and lists with more than 4 items.',
        tradeoffs: ['Less horizontal imagery space', 'Requires concise titles'],
        implementationDifficulty: 'easy',
      },
      {
        id: 'feature-hierarchy',
        title: 'Option B — Featured Item + Secondary List',
        description: 'Keep 1–2 primary items prominently surfaced, and subordinate remaining items into a compact list.',
        whenToUse: 'Best when one item or metric is significantly more important than the rest.',
        tradeoffs: ['Must determine primary feature item'],
        implementationDifficulty: 'medium',
      },
      {
        id: 'grouped-sections',
        title: 'Option C — Grouped Categorical Sections',
        description: 'Group items by category with clean typography headers instead of boxing every single item into its own card.',
        whenToUse: 'Best when items belong to different categories or workflows.',
        tradeoffs: ['Requires categorizing the data'],
        implementationDifficulty: 'medium',
      },
    ];
  }
}
