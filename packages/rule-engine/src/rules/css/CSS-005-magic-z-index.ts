import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const CSS_005_RULE: CraftLensRule = {
  id: 'CSS-005',
  category: 'css',
  title: 'Magic Z-Index Escalation',
  description: 'Arbitrary high z-index escalation (e.g. z-[9999], zIndex: 99999) detected to bypass stacking contexts.',
  rationale:
    'AI coding agents frequently apply magic numbers like 9999 or 999999 to force elements above other layers, starting an uncontrolled z-index escalation war and breaking modals/tooltips.',
  severity: 'warning',
  confidence: 0.90,
  engine: 'ast',
  recommendation: 'Use a structured z-index scale (e.g. z-10, z-20, z-50 for overlays) and proper stacking context management.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['css', 'styling', 'z-index', 'patchwork'],
  minimumAuditLevel: 'moderate',
  problemTitle: 'Layer stacking & z-index',
  whatIsWrong: 'Arbitrary high z-index escalation number used to bypass stacking contexts.',
  whyItMatters:
    'Using magic values like 9999 triggers z-index wars that inevitably break modals, dropdowns, and tooltips.',
  howToFix:
    'Use structured project z-index tokens (e.g. z-10, z-20, z-50) and manage stacking contexts cleanly.',
  suggestedSteps: [
    'Identify what layer this element belongs to (sticky, dropdown, modal, tooltip).',
    'Replace the magic number with the appropriate layer token.',
    'If the element is trapped beneath another, fix parent stacking contexts rather than inflating z-index.',
  ],
  structuredRecommendation: {
    summary: 'Use structured z-index scale rather than arbitrary escalation numbers.',
    why: 'Arbitrary z-index numbers break modal and dropdown stacking orders across the application.',
    howToFix: 'Use structured project z-index tokens (e.g. z-10 for sticky headers, z-50 for modals) and fix parent stacking contexts.',
    steps: [
      'Identify what layer this element belongs to (sticky, dropdown, modal, tooltip).',
      'Replace the magic number with the appropriate layer token.',
      'If the element is trapped beneath another, fix parent stacking contexts rather than inflating z-index.',
    ],
    fix: {
      type: 'assisted',
      description: 'Replace magic z-index with structured layer token',
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
    const magicTailwindPattern = /\bz-\[(\d{4,})\]/g;

    function checkNode(node: ts.Node): void {
      // 1. Check JSX className string literals (e.g. className="z-[9999]")
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const text = node.text;
        let match: RegExpExecArray | null;
        while ((match = magicTailwindPattern.exec(text)) !== null) {
          const val = parseInt(match[1], 10);
          if (val >= 999) {
            const location = parsed!.getLocation(node);
            const originalNodeText = node.getText(sourceFile);
            const newNodeText = originalNodeText.replace(match[0], 'z-50');

            findings.push({
              ruleId: 'CSS-005',
              message: `Suspicious magic z-index escalation "${match[0]}" detected.`,
              description:
                'Arbitrary escalation values like 9999 or 99999 are usually patches applied to mask stacking context issues rather than establishing a clean layer hierarchy.',
              severity: 'warning',
              confidence: 0.90,
              location,
              findingType: 'problem',
              fix: {
                title: `Replace "${match[0]}" with "z-50"`,
                kind: 'safe',
                isPreferred: true,
                changes: [
                  {
                    range: location,
                    newText: newNodeText,
                    before: originalNodeText,
                  },
                ],
              },
              designFix: {
                id: `fix-css-005-class-${location.start.line}`,
                title: 'Use standard z-index token',
                description: `Replace escalation ${match[0]} with standard layer token z-50.`,
                changes: [
                  {
                    range: location,
                    after: newNodeText,
                    before: originalNodeText,
                    explanation: 'Standardized z-index layer scale',
                  },
                ],
                safety: 'safe',
                isPreferred: true,
              },
              evidence: [
                astEvidence(
                  `Found excessive magic z-index utility "${match[0]}" in className.`,
                  location,
                  node.getText(sourceFile)
                ),
              ],
              recommendation: 'Use standard tokenized z-indices (e.g., z-30, z-50) and isolate stacking contexts with relative/isolate.',
            });
          }
        }
      }

      // 2. Check inline style objects: zIndex: 9999 or '9999'
      if (ts.isPropertyAssignment(node)) {
        const propName = node.name.getText(sourceFile);
        if (propName === 'zIndex' || propName === '"zIndex"' || propName === "'zIndex'") {
          const init = node.initializer;
          let val: number | null = null;
          if (ts.isNumericLiteral(init)) {
            val = parseInt(init.text, 10);
          } else if (ts.isStringLiteral(init)) {
            val = parseInt(init.text, 10);
          }

          if (val !== null && !isNaN(val) && val >= 999) {
            const location = parsed!.getLocation(node);
            const originalPropText = node.getText(sourceFile);
            const newPropText = `${propName}: 50`;

            findings.push({
              ruleId: 'CSS-005',
              message: `Suspicious magic inline zIndex: ${val} detected.`,
              description:
                'Applying excessive numeric zIndex values masks stacking bugs and introduces layout conflicts with dropdowns and overlays.',
              severity: 'warning',
              confidence: 0.92,
              location,
              findingType: 'problem',
              fix: {
                title: `Change zIndex to 50`,
                kind: 'safe',
                isPreferred: true,
                changes: [
                  {
                    range: location,
                    newText: newPropText,
                    before: originalPropText,
                  },
                ],
              },
              designFix: {
                id: `fix-css-005-style-${location.start.line}`,
                title: 'Standardize zIndex value',
                description: `Change magic ${val} to standardized layer value 50.`,
                changes: [
                  {
                    range: location,
                    after: newPropText,
                    before: originalPropText,
                    explanation: 'Standardized z-index layer value',
                  },
                ],
                safety: 'safe',
                isPreferred: true,
              },
              evidence: [
                astEvidence(
                  `Found inline style zIndex: ${val}`,
                  location,
                  node.getText(sourceFile)
                ),
              ],
              recommendation: 'Replace with defined z-index layer variables or standard CSS classes.',
            });
          }
        }
      }

      ts.forEachChild(node, checkNode);
    }

    checkNode(sourceFile);
    return findings;
  },
};
