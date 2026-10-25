import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const PH_011_RULE: CraftLensRule = {
  id: 'PH-011',
  category: 'placeholder',
  title: 'Lorem Ipsum Placeholder in User Interface',
  description: 'Unrendered mockup Latin placeholder text detected in user-facing JSX or UI string.',
  rationale:
    'AI models routinely generate "Lorem ipsum dolor sit amet" placeholder copy when building component UI, leaving mock text that risks leaking into staging or production builds.',
  severity: 'warning',
  confidence: 0.98,
  engine: 'ast',
  recommendation: 'Replace placeholder Latin text with meaningful domain content or dynamic props.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['placeholder', 'ui-copy', 'intent-debt', 'ai-patchwork'],
  minimumAuditLevel: 'easy',
  problemTitle: 'Placeholder copy',
  whatIsWrong: 'Unfinished Lorem Ipsum placeholder text is embedded in user-facing UI.',
  whyItMatters: 'Mock placeholder copy looks unfinished and risks leaking into production environments.',
  howToFix: 'Replace placeholder copy with realistic domain text or bind it to component props.',
  suggestedSteps: [
    'Identify what content this element will actually display.',
    'Replace Lorem Ipsum with real product copy or a component prop.',
    'Ensure empty states are handled gracefully if data is dynamic.',
  ],
  structuredRecommendation: {
    summary: 'Replace placeholder copy with realistic product copy or dynamic props.',
    why: 'Latin placeholder copy leaves user interfaces looking unfinished and risks shipping unreviewed text.',
    howToFix: 'Replace Lorem Ipsum with domain copy or connect it to data models.',
    steps: [
      'Identify what content this element will actually display.',
      'Replace Lorem Ipsum with real product copy or a component prop.',
      'Ensure empty states are handled gracefully if data is dynamic.',
    ],
    fix: {
      type: 'assisted',
      description: 'Replace Lorem Ipsum with domain text',
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
    const loremPattern = /lorem\s+ipsum/i;

    function checkTextNode(node: ts.JsxText | ts.StringLiteral): void {
      const text = node.getText(sourceFile);
      if (loremPattern.test(text)) {
        // Exclude tests or test fixtures files by path check
        if (context.filePath.includes('.test.') || context.filePath.includes('.spec.')) {
          return;
        }

        const location = parsed!.getLocation(node);
        const originalText = text;
        const replacement = originalText.startsWith('"') || originalText.startsWith("'")
          ? '"Overview description and key details for this section."'
          : 'Overview description and key details for this section.';

        findings.push({
          ruleId: 'PH-011',
          message: 'Lorem Ipsum placeholder text detected in UI.',
          description:
            'Generic Latin placeholder text was left in rendered component markup. Replace with actual user-facing product copy.',
          severity: 'warning',
          confidence: 0.98,
          location,
          findingType: 'problem',
          fix: {
            title: 'Replace placeholder with realistic copy',
            kind: 'safe',
            isPreferred: true,
            changes: [
              {
                range: location,
                newText: replacement,
                before: originalText,
              },
            ],
          },
          designFix: {
            id: `fix-ph-011-${location.start.line}`,
            title: 'Replace placeholder copy',
            description: 'Replace generic Latin placeholder with representative product copy.',
            changes: [
              {
                range: location,
                after: replacement,
                before: originalText,
                explanation: 'User-facing realistic product copy',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            astEvidence(
              'Found "Lorem ipsum" pattern in user-facing markup text.',
              location,
              text.substring(0, 80)
            ),
          ],
          recommendation: 'Replace placeholder copy with representative product copy.',
        });
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxText(node)) {
        checkTextNode(node);
      } else if (ts.isStringLiteral(node)) {
        // Only check string literals if inside JSX attributes or JSX children
        if (node.parent && (ts.isJsxAttribute(node.parent) || ts.isJsxExpression(node.parent))) {
          checkTextNode(node);
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
