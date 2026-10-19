import ts from 'typescript';
import {
  AntiSlopRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@anti-slop/core';
import { ParsedDocument } from '@anti-slop/parser';

export const PH_011_RULE: AntiSlopRule = {
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
        findings.push({
          ruleId: 'PH-011',
          message: 'Lorem Ipsum placeholder text detected in UI.',
          description:
            'Generic Latin placeholder text was left in rendered component markup. Replace with actual user-facing product copy.',
          severity: 'warning',
          confidence: 0.98,
          location,
          findingType: 'problem',
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
