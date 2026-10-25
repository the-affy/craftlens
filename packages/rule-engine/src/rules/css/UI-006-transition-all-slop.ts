import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const UI_006_RULE: CraftLensRule = {
  id: 'UI-006',
  category: 'css',
  title: 'Blanket "transition-all" Animation Slop',
  description: 'An element uses "transition-all" or "transition: all", causing layout thrashing and unintended animations across non-composite properties.',
  rationale:
    'AI models habitually tack "transition-all duration-300" onto components as generic styling boilerplate. Animating all properties triggers CPU reflows for layout properties (width, height, margin, padding, border) on every single frame, causing stutter, frame drops, and awkward animation during window resizing or DOM state shifts.',
  severity: 'warning',
  confidence: 0.9,
  engine: 'ast',
  recommendation: 'Target only GPU-composited properties (transform, opacity) or specific color properties (transition-colors).',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['ui-slop', 'performance', 'css', 'transitions', 'animations'],
  minimumAuditLevel: 'moderate',
  problemTitle: 'Transition Performance',
  whatIsWrong: 'Blanket transition-all animates layout dimensions and causes browser reflow thrashing.',
  whyItMatters:
    'Layout properties (width, height, padding, margin) animate on the main thread and drop frames. Window resize and content shifts trigger accidental animations.',
  howToFix:
    'Replace transition-all with transition-colors or transition: opacity 200ms ease, transform 200ms ease.',
  suggestedSteps: [
    'Change "transition-all" in className to "transition-colors" or "transition-opacity transition-transform".',
    'Or replace inline "transition: all ..." with targeted property transitions.',
  ],
  structuredRecommendation: {
    summary: 'Replace blanket transition-all with specific property transitions.',
    why: 'Transitioning all properties causes 60fps main-thread layout thrashing and jittery responsiveness.',
    howToFix: 'Specify only the properties that actually animate (e.g. colors, transform, opacity).',
    steps: [
      'Replace transition-all with transition-colors or transition-transform.',
    ],
    fix: {
      type: 'assisted',
      description: 'Replace transition-all with targeted transition',
    },
  },
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;

    function checkAttributes(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): void {
      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const attrName = prop.name.getText(sourceFile);

        // Check className / class
        if (attrName === 'className' || attrName === 'class') {
          if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
            const classVal = prop.initializer.text;
            const classes = classVal.split(/\s+/);
            if (classes.includes('transition-all')) {
              const location = parsed!.getLocation(prop);
              const originalAttrText = prop.getText(sourceFile);
              const newAttrText = originalAttrText.replace(/\btransition-all\b/, 'transition-colors');

              findings.push({
                ruleId: 'UI-006',
                message: `Element uses blanket "transition-all" class, triggering layout recalculations.`,
                description:
                  'Using "transition-all" causes the browser to animate non-composite properties (padding, width, height, borders), leading to layout thrashing and sluggish mobile performance.',
                severity: 'warning',
                confidence: 0.9,
                location,
                problemTitle: 'Transition Performance',
                whatIsWrong: 'Element applies "transition-all" instead of targeted property transitions.',
                whyItMatters:
                  'Non-composite properties trigger expensive CPU reflow and repaint on every animation frame, degrading user experience.',
                howToFix:
                  'Replace "transition-all" with "transition-colors" or "transition-opacity transition-transform".',
                suggestedSteps: [
                  'Use "transition-colors" for hover color changes.',
                  'Use "transition-opacity transition-transform" for modals, tooltips, and popovers.',
                ],
                fix: {
                  title: 'Replace "transition-all" with "transition-colors"',
                  kind: 'safe',
                  isPreferred: true,
                  changes: [
                    {
                      range: location,
                      newText: newAttrText,
                      before: originalAttrText,
                    },
                  ],
                },
                designFix: {
                  id: `fix-ui-006-class-${location.start.line}`,
                  title: 'Target color transitions only',
                  description: 'Replace blanket "transition-all" with "transition-colors" to eliminate frame drops and layout reflows.',
                  changes: [
                    {
                      range: location,
                      after: newAttrText,
                      before: originalAttrText,
                      explanation: 'Prevent main-thread reflow thrashing',
                    },
                  ],
                  safety: 'safe',
                  isPreferred: true,
                },
                evidence: [
                  astEvidence(
                    `Found "transition-all" in className at line ${location.start.line}.`,
                    location,
                    prop.getText(sourceFile)
                  ),
                ],
              });
            }
          }
        }

        // Check style={{ transition: 'all ...' }}
        if (attrName === 'style' && prop.initializer && ts.isJsxExpression(prop.initializer)) {
          const expr = prop.initializer.expression;
          if (expr && ts.isObjectLiteralExpression(expr)) {
            for (const p of expr.properties) {
              if (ts.isPropertyAssignment(p)) {
                const name = p.name.getText(sourceFile);
                if (name === 'transition' || name === '"transition"') {
                  const val = p.initializer.getText(sourceFile);
                  if (/\ball\b/i.test(val)) {
                    const location = parsed!.getLocation(p);
                    const originalPropText = p.getText(sourceFile);
                    const newPropText = originalPropText.replace(/\ball\b/i, 'opacity 0.2s ease, transform 0.2s ease');

                    findings.push({
                      ruleId: 'UI-006',
                      message: `Inline style uses blanket "transition: all", causing layout recalculations.`,
                      description:
                        'Applying "transition: all" forces the browser to evaluate every layout and paint property on the element, resulting in frame drops.',
                      severity: 'warning',
                      confidence: 0.9,
                      location,
                      problemTitle: 'Transition Performance',
                      whatIsWrong: 'Inline style specifies "transition: all".',
                      whyItMatters:
                        'Main-thread layout recalculations cause janky animations, especially on lower-powered devices.',
                      howToFix:
                        'Specify only composite properties: "opacity 200ms ease, transform 200ms ease".',
                      suggestedSteps: [
                        'Replace "all" with specific property names like opacity or transform.',
                      ],
                      fix: {
                        title: 'Target composite properties',
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
                        id: `fix-ui-006-style-${location.start.line}`,
                        title: 'Target composite properties',
                        description: 'Specify composite properties (opacity, transform) to avoid layout reflows.',
                        changes: [
                          {
                            range: location,
                            after: newPropText,
                            before: originalPropText,
                            explanation: 'Eliminate layout recalculations on animation',
                          },
                        ],
                        safety: 'safe',
                        isPreferred: true,
                      },
                      evidence: [
                        astEvidence(
                          `Found transition: ${val} at line ${location.start.line}.`,
                          location,
                          p.getText(sourceFile)
                        ),
                      ],
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        checkAttributes(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
