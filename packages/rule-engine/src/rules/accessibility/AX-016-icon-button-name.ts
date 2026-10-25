import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const AX_016_RULE: CraftLensRule = {
  id: 'AX-016',
  category: 'accessibility',
  title: 'Icon Button Without Accessible Name',
  description: 'Interactive button containing an icon or SVG has no accessible text or aria-label.',
  rationale:
    'Screen readers announce unlabeled icon buttons as generic "button" with no purpose, completely breaking accessibility for vision-impaired users.',
  severity: 'error',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Provide an aria-label or visually hidden text describing the button action.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['accessibility', 'wcag', 'a11y', 'screen-reader'],
  minimumAuditLevel: 'easy',
  problemTitle: 'Accessible button name',
  whatIsWrong: 'The button has no accessible name.',
  whyItMatters: 'Screen-reader users may not know what this control does.',
  howToFix: 'Add an aria-label that describes the action (e.g. aria-label="Open settings").',
  suggestedSteps: [
    'Identify the exact action the button performs.',
    'Add an aria-label with a concise descriptive action name.',
    'Alternatively, add visually hidden text inside the button.',
  ],
  structuredRecommendation: {
    summary: 'The button has no accessible name.',
    why: 'Screen-reader users may not know what this control does.',
    howToFix: 'Add an aria-label that describes the action.',
    steps: [
      'Identify the exact action the button performs.',
      'Add an aria-label with a concise descriptive action name.',
      'Alternatively, add visually hidden text inside the button.',
    ],
    fix: {
      type: 'assisted',
      description: 'Add aria-label to button',
    },
  },
  supportedActions: ['fix', 'explain', 'not_a_problem'],
  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;

    function checkButton(node: ts.JsxElement | ts.JsxSelfClosingElement): void {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = opening.tagName.getText(sourceFile);
      if (tagName !== 'button') return;

      let hasAriaLabel = false;
      let hasAriaLabelledBy = false;
      let ariaHidden = false;

      for (const prop of opening.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const attrName = prop.name.getText(sourceFile);
        if (attrName === 'aria-label') hasAriaLabel = true;
        else if (attrName === 'aria-labelledby') hasAriaLabelledBy = true;
        else if (attrName === 'aria-hidden') ariaHidden = true;
      }

      if (hasAriaLabel || hasAriaLabelledBy || ariaHidden) {
        return;
      }

      // Check children if jsxElement
      if (ts.isJsxElement(node)) {
        let hasAccessibleText = false;
        let containsIconOrSvg = false;

        function hasText(elem: ts.Node): boolean {
          let found = false;
          function walk(n: ts.Node) {
            if (ts.isJsxText(n) && n.getText(sourceFile).trim().length > 0) {
              found = true;
              return;
            }
            if (ts.isStringLiteral(n) && n.text.trim().length > 0) {
              found = true;
              return;
            }
            ts.forEachChild(n, walk);
          }
          walk(elem);
          return found;
        }

        for (const child of node.children) {
          if (ts.isJsxText(child) && child.getText(sourceFile).trim().length > 0) {
            hasAccessibleText = true;
          } else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
            const childTag = ts.isJsxElement(child)
              ? child.openingElement.tagName.getText(sourceFile)
              : child.tagName.getText(sourceFile);
            if (
              childTag === 'svg' ||
              childTag.toLowerCase().includes('icon') ||
              childTag === 'X' ||
              childTag === 'ChevronRight' ||
              childTag === 'ChevronLeft' ||
              childTag === 'Plus' ||
              childTag === 'Trash'
            ) {
              containsIconOrSvg = true;
            } else if (hasText(child)) {
              hasAccessibleText = true;
            }
          }
        }

        if (containsIconOrSvg && !hasAccessibleText) {
          const location = parsed!.getLocation(opening);
          findings.push({
            ruleId: 'AX-016',
            message: 'Icon button is missing an accessible name.',
            description:
              'A button containing only an icon or SVG without aria-label cannot be announced meaningfully by screen readers.',
            severity: 'error',
            confidence: 0.95,
            location,
            findingType: 'problem',
            evidence: [
              astEvidence(
                'Found <button> containing icon element but missing aria-label or aria-labelledby.',
                location,
                opening.getText(sourceFile)
              ),
            ],
            recommendation: 'Add an aria-label describing the button action (e.g. aria-label="Close dialog").',
            fix: {
              title: 'Add aria-label="Action" to button',
              kind: 'assisted',
              changes: [
                {
                  range: parsed!.getLocation(opening.tagName),
                  newText: `${opening.tagName.getText(sourceFile)} aria-label="Action"`,
                },
              ],
            },
          });
        }
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        checkButton(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
