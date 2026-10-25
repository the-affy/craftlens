import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const VH_008_RULE: CraftLensRule = {
  id: 'VH-008',
  category: 'hierarchy',
  title: 'Information Hierarchy Mismatch',
  problemTitle: 'Weak visual hierarchy',
  description: 'Secondary or auxiliary metadata shares identical typography weight and size with primary content.',
  rationale:
    'Visual hierarchy should communicate what matters first. When timestamps, footnotes, or IDs use high-prominence heading typography, users struggle to scan the page efficiently.',
  severity: 'warning',
  confidence: 0.88,
  engine: 'ast',
  recommendation: 'Subordinate auxiliary information with muted color (e.g. text-muted-foreground) and smaller scale (e.g. text-xs / text-sm).',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['hierarchy', 'typography', 'visual-design'],
  minimumAuditLevel: 'moderate',
  diagnosis: 'Auxiliary metadata is styled with heading-level typography weight.',
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Subordinate supporting metadata using muted color and secondary scale.',
    rationale: 'Scanning speed depends on high contrast between primary titles and supporting details.',
    fix: {
      type: 'assisted',
      description: 'Replace heavy typography with text-sm text-muted-foreground',
    },
  },

  detect(context: AnalysisContext): Finding[] {
    // 1. Try unified UI analyzer
    try {
      const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
      const uiFindings = report.composition.findings.filter(f => f.ruleId === 'VH-008');
      if (uiFindings.length > 0) {
        return uiFindings;
      }
    } catch {
      // Fallback to AST below
    }

    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) return [];

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;

    function checkElement(node: ts.JsxElement | ts.JsxSelfClosingElement): void {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const text = opening.getText(sourceFile);

      // Check if element has metadata text (like date, id, timestamp, subtitle) but uses text-xl/2xl font-bold
      for (const prop of opening.attributes.properties) {
        if (!ts.isJsxAttribute(prop) || prop.name.getText(sourceFile) !== 'className' || !prop.initializer) {
          continue;
        }

        let cls = '';
        if (ts.isStringLiteral(prop.initializer)) {
          cls = prop.initializer.text;
        }

        if (
          (cls.includes('text-xl') || cls.includes('text-2xl') || cls.includes('text-lg')) &&
          (cls.includes('font-bold') || cls.includes('font-semibold'))
        ) {
          // Check child text for metadata terms
          const nodeFullText = node.getText(sourceFile);
          if (
            /\b(Created at|Updated at|ID:|Version:|Timestamp|Last modified|UUID)\b/i.test(nodeFullText)
          ) {
            const loc = parsed!.getLocation(opening);
            const newCls = cls
              .replace(/text-(?:2xl|xl|lg)/g, 'text-sm')
              .replace(/font-(?:bold|semibold)/g, 'font-medium text-muted-foreground');

            findings.push({
              ruleId: 'VH-008',
              message: 'Auxiliary metadata is styled with dominant heading typography.',
              description:
                'Metadata such as timestamps or IDs should be subordinate to the main content rather than rendered with heavy display typography.',
              severity: 'suggestion',
              confidence: 0.85,
              location: loc,
              findingType: 'suggestion',
              diagnosis: 'Auxiliary metadata styled with heading typography.',
              recommendation:
                'Subordinate metadata with smaller, muted text (e.g. text-sm text-muted-foreground).',
              structuredRecommendation: {
                summary: 'Use text-sm text-muted-foreground for auxiliary metadata.',
                rationale: 'Preserves visual emphasis for primary titles and metrics.',
              },
              supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
              evidence: [
                astEvidence(
                  `Metadata element contains heavy classes "${cls}"`,
                  loc,
                  text
                ),
              ],
              fix: {
                title: 'Subordinate metadata classes to text-sm text-muted-foreground',
                kind: 'assisted',
                changes: [
                  {
                    range: loc,
                    newText: text.replace(cls, newCls),
                    before: text,
                  },
                ],
              },
            });
          }
        }
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        checkElement(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
