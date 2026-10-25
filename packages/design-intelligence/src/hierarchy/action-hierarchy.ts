import ts from 'typescript';
import { ParsedDocument } from '@craftlens/parser';
import { RecommendationAlternative, SourceLocation } from '@craftlens/core';

export interface ActionInfo {
  node: ts.JsxElement | ts.JsxSelfClosingElement;
  text: string;
  isPrimary: boolean;
  variant?: string;
  location: SourceLocation;
  rawText: string;
}

export interface ActionHierarchyResult {
  containerNode?: ts.Node;
  primaryActions: ActionInfo[];
  allActions: ActionInfo[];
  competingActionsCount: number;
}

export class ActionHierarchyAnalyzer {
  public static analyzeActions(parsed: ParsedDocument): ActionHierarchyResult[] {
    const sourceFile = parsed.sourceFile;
    if (!sourceFile) return [];

    const results: ActionHierarchyResult[] = [];

    // Helper to determine if a JSX element is a button or primary action
    function evaluateAction(node: ts.JsxElement | ts.JsxSelfClosingElement): ActionInfo | null {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = opening.tagName.getText(sourceFile);

      const isButton =
        tagName === 'button' ||
        tagName === 'Button' ||
        tagName.endsWith('Button') ||
        tagName === 'ActionButton';

      if (!isButton) return null;

      let variant: string | undefined;
      let className = '';

      for (const prop of opening.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const name = prop.name.getText(sourceFile);
        if (name === 'variant' && prop.initializer) {
          if (ts.isStringLiteral(prop.initializer)) {
            variant = prop.initializer.text;
          } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression && ts.isStringLiteral(prop.initializer.expression)) {
            variant = prop.initializer.expression.text;
          }
        } else if (name === 'className' && prop.initializer) {
          if (ts.isStringLiteral(prop.initializer)) {
            className = prop.initializer.text;
          }
        }
      }

      // Check if primary
      // Default Button in shadcn / UI libraries without variant is usually primary,
      // or explicitly variant="primary" / variant="default"
      // or heavy background classes: bg-blue, bg-primary, bg-indigo, bg-black, bg-white (in dark mode)
      const isExplicitSecondary =
        variant === 'secondary' ||
        variant === 'outline' ||
        variant === 'ghost' ||
        variant === 'link' ||
        variant === 'text' ||
        className.includes('bg-transparent') ||
        className.includes('border') && !className.includes('bg-');

      const isExplicitPrimary =
        variant === 'primary' ||
        variant === 'default' ||
        (!variant && (className.includes('bg-primary') || className.includes('bg-blue') || className.includes('bg-indigo') || className.includes('bg-black'))) ||
        (!variant && tagName === 'Button' && !isExplicitSecondary);

      return {
        node,
        text: node.getText(sourceFile),
        isPrimary: isExplicitPrimary && !isExplicitSecondary,
        variant,
        location: parsed.getLocation(opening),
        rawText: opening.getText(sourceFile),
      };
    }

    // Inspect container elements (e.g. div, flex, grid, section, header, form)
    function inspectContainer(container: ts.Node): void {
      const actionsInContainer: ActionInfo[] = [];

      function walk(child: ts.Node) {
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
          const action = evaluateAction(child);
          if (action) {
            actionsInContainer.push(action);
            return; // Don't inspect inner elements of button
          }
        }
        ts.forEachChild(child, walk);
      }

      ts.forEachChild(container, walk);

      const primaryActions = actionsInContainer.filter(a => a.isPrimary);
      if (primaryActions.length >= 2) {
        results.push({
          containerNode: container,
          primaryActions,
          allActions: actionsInContainer,
          competingActionsCount: primaryActions.length,
        });
      }
    }

    function visit(node: ts.Node): void {
      if (
        ts.isJsxElement(node) &&
        ['div', 'section', 'header', 'nav', 'form', 'CardHeader', 'CardFooter'].includes(
          node.openingElement.tagName.getText(sourceFile)
        )
      ) {
        inspectContainer(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return results;
  }

  public static getAlternatives(): RecommendationAlternative[] {
    return [
      {
        id: 'primary-secondary',
        title: 'Primary / Secondary Weight Distribution',
        description: 'Designate the main user objective as primary, and convert the remaining actions to secondary or outline styling.',
        whenToUse: 'When one action represents the dominant desired user outcome (e.g. "Save", "Submit", "Upgrade").',
        tradeoffs: ['Requires picking one action as preferred'],
        implementationDifficulty: 'easy',
      },
      {
        id: 'compact-dropdown',
        title: 'Action Menu or Split Dropdown',
        description: 'Keep the most frequent action standalone and group auxiliary actions into a dropdown menu.',
        whenToUse: 'When there are 3+ actions of moderate frequency and space is constrained.',
        tradeoffs: ['Additional click required for secondary options'],
        implementationDifficulty: 'medium',
      },
      {
        id: 'contextual-link',
        title: 'Subtle Ghost / Text Link',
        description: 'Demote non-urgent actions (like "Cancel", "Learn more", "Docs") to quiet text or ghost buttons.',
        whenToUse: 'For low-risk escape hatches or background documentation links.',
        tradeoffs: ['Lower visibility for demoted action'],
        implementationDifficulty: 'easy',
      },
    ];
  }
}
