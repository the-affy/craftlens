import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const UI_009_RULE: CraftLensRule = {
  id: 'UI-009',
  category: 'css',
  title: 'Hardcoded Viewport-Breaking Container Width',
  description: 'A layout container specifies a large fixed pixel width without responsive constraints, breaking mobile and split-view layouts.',
  rationale:
    'AI models frequently generate fixed pixel desktop layouts such as width: 800px or w-[900px]. On mobile devices, tablets, and side-by-side IDE panes, this hardcoded width overflows the viewport, causing unwanted horizontal scrolling and severed content.',
  severity: 'warning',
  confidence: 0.9,
  engine: 'ast',
  recommendation: 'Use max-width with fluid width: e.g. max-w-4xl w-full or max-width: 100%.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['ui-slop', 'responsive', 'mobile', 'layout', 'viewport'],
  minimumAuditLevel: 'moderate',
  problemTitle: 'Responsive Container Width',
  whatIsWrong: 'Container has a large hardcoded pixel width (>=640px) without responsive max-width.',
  whyItMatters:
    'Fixed pixel widths break on smaller screens, forcing horizontal scrollbars and ruining mobile usability.',
  howToFix:
    'Replace fixed width with fluid max-width constraints (e.g. max-w-4xl w-full or max-width: 100%).',
  suggestedSteps: [
    'Change fixed pixel width to max-w-{size} w-full.',
    'Or add max-width: 100% to ensure container shrinks cleanly on narrow viewports.',
  ],
  structuredRecommendation: {
    summary: 'Replace fixed desktop width with responsive max-width.',
    why: 'Fixed pixel widths overflow viewports narrower than the specified pixel count.',
    howToFix: 'Combine max-width with 100% fluid width.',
    steps: [
      'Replace w-[800px] with max-w-3xl w-full.',
    ],
    fix: {
      type: 'assisted',
      description: 'Convert fixed width to fluid max-width',
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

    function checkNode(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): void {
      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const attrName = prop.name.getText(sourceFile);

        // Check Tailwind arbitrary width classes e.g. w-[800px], w-[1000px]
        if (attrName === 'className' || attrName === 'class') {
          if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
            const classVal = prop.initializer.text;
            const classes = classVal.split(/\s+/);
            const hasMaxWidth = classes.some(c => c.startsWith('max-w-') || c === 'w-full');
            
            for (const cls of classes) {
              const match = cls.match(/^w-\[(\d+)px\]$/);
              if (match) {
                const pxVal = parseInt(match[1], 10);
                if (pxVal >= 640 && !hasMaxWidth) {
                  const location = parsed!.getLocation(prop);
                  const originalAttr = prop.getText(sourceFile);
                  const newAttr = originalAttr.replace(cls, 'max-w-4xl w-full');

                  findings.push({
                    ruleId: 'UI-009',
                    message: `Container has hardcoded width "${cls}" without responsive max-width constraint.`,
                    description:
                      `Using a fixed width of ${pxVal}px without responsive constraints causes horizontal scrollbars and layout breakage on mobile devices or split screens.`,
                    severity: 'warning',
                    confidence: 0.9,
                    location,
                    problemTitle: 'Responsive Container Width',
                    whatIsWrong: `Container specifies fixed ${cls} which overflows viewports smaller than ${pxVal}px.`,
                    whyItMatters:
                      'Fixed pixel containers ruin mobile usability and violate responsive design principles.',
                    howToFix:
                      `Replace "${cls}" with "max-w-4xl w-full" or apply responsive prefixes.`,
                    suggestedSteps: [
                      `Replace "${cls}" with a fluid utility such as "max-w-3xl w-full".`,
                    ],
                    fix: {
                      title: `Replace "${cls}" with "max-w-4xl w-full"`,
                      kind: 'safe',
                      isPreferred: true,
                      changes: [
                        {
                          range: location,
                          newText: newAttr,
                          before: originalAttr,
                        },
                      ],
                    },
                    designFix: {
                      id: `fix-ui-009-class-${location.start.line}`,
                      title: 'Make container width fluid',
                      description: `Replace fixed ${cls} with fluid "max-w-4xl w-full" for responsive scaling.`,
                      changes: [
                        {
                          range: location,
                          after: newAttr,
                          before: originalAttr,
                          explanation: 'Responsive max-width constraint',
                        },
                      ],
                      safety: 'safe',
                      isPreferred: true,
                    },
                    evidence: [
                      astEvidence(
                        `Found fixed width "${cls}" at line ${location.start.line}.`,
                        location,
                        prop.getText(sourceFile)
                      ),
                    ],
                  });
                }
              }
            }
          }
        }

        // Check style={{ width: '800px' }} or style={{ width: 800 }}
        if (attrName === 'style' && prop.initializer && ts.isJsxExpression(prop.initializer)) {
          const expr = prop.initializer.expression;
          if (expr && ts.isObjectLiteralExpression(expr)) {
            let widthVal: number | undefined;
            let hasMaxWidth = false;
            let widthProp: ts.PropertyAssignment | undefined;

            for (const p of expr.properties) {
              if (ts.isPropertyAssignment(p)) {
                const name = p.name.getText(sourceFile);
                if (name === 'maxWidth' || name === '"maxWidth"') {
                  hasMaxWidth = true;
                }
                if (name === 'width' || name === '"width"') {
                  widthProp = p;
                  const valText = p.initializer.getText(sourceFile).replace(/['"]/g, '');
                  if (/^\d+px$/.test(valText)) {
                    widthVal = parseInt(valText, 10);
                  } else if (/^\d+$/.test(valText)) {
                    widthVal = parseInt(valText, 10);
                  }
                }
              }
            }

            if (widthVal && widthVal >= 640 && !hasMaxWidth && widthProp) {
              const location = parsed!.getLocation(widthProp);
              const originalStyleProp = widthProp.getText(sourceFile);
              const newStyleProp = `width: '100%', maxWidth: '${widthVal}px'`;

              findings.push({
                ruleId: 'UI-009',
                message: `Container has hardcoded style width: ${widthVal}px without maxWidth constraint.`,
                description:
                  `Using fixed width: ${widthVal}px causes viewport overflow on smaller screens. Replace with maxWidth or fluid percentage.`,
                severity: 'warning',
                confidence: 0.9,
                location,
                problemTitle: 'Responsive Container Width',
                whatIsWrong: `Fixed inline width: ${widthVal}px breaks on viewports smaller than ${widthVal}px.`,
                whyItMatters:
                  'Horizontal scrolling on mobile or narrow panes creates poor user experience.',
                howToFix:
                  `Add maxWidth: '100%' or change to fluid width.`,
                suggestedSteps: [
                  `Set maxWidth: '100%' alongside width: ${widthVal}px.`,
                ],
                fix: {
                  title: `Constrain width to 100% maxWidth`,
                  kind: 'safe',
                  isPreferred: true,
                  changes: [
                    {
                      range: location,
                      newText: newStyleProp,
                      before: originalStyleProp,
                    },
                  ],
                },
                designFix: {
                  id: `fix-ui-009-style-${location.start.line}`,
                  title: 'Constrain width to 100% maxWidth',
                  description: `Change fixed width to fluid width: 100% with maxWidth: ${widthVal}px.`,
                  changes: [
                    {
                      range: location,
                      after: newStyleProp,
                      before: originalStyleProp,
                      explanation: 'Add responsive maxWidth constraint',
                    },
                  ],
                  safety: 'safe',
                  isPreferred: true,
                },
                evidence: [
                  astEvidence(
                    `Found inline width: ${widthVal}px at line ${location.start.line}.`,
                    location,
                    widthProp.getText(sourceFile)
                  ),
                ],
              });
            }
          }
        }
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        checkNode(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
