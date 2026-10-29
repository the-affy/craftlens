import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const ID_004_RULE: CraftLensRule = {
  id: 'ID-004',
  category: 'functionality',
  title: 'Call To Action Without Outcome',
  description: 'A styled interactive action button has no onClick handler, no href, or a dummy no-op handler.',
  rationale:
    'Buttons in user interfaces promise an outcome when pressed. Empty or placeholder actions deceive users, damage trust, and indicate incomplete implementation.',
  severity: 'warning',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Attach a valid event handler, navigation link, or mark the button as disabled with a tooltip.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['intent', 'cta', 'buttons', 'interaction', 'empty-functionality'],
  minimumAuditLevel: 'moderate',
  diagnosis: 'Interactive button has no handler or destination.',
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Attach an active handler or provide disabled state.',
    rationale: 'Dead-end buttons frustrate users and signal unverified code.',
    fix: {
      type: 'assisted',
      description: 'Add onClick handler or disabled attribute',
    },
  },

  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) return [];

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;

    function checkButton(node: ts.JsxElement | ts.JsxSelfClosingElement): void {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = opening.tagName.getText(sourceFile);

      const isButtonLike =
        tagName === 'button' ||
        tagName === 'Button' ||
        tagName.endsWith('Button');

      if (!isButtonLike) return;

      let hasOnClick = false;
      let hasHref = false;
      let hasTypeSubmit = false;
      let isDisabled = false;
      let isNoOpHandler = false;

      for (const prop of opening.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const name = prop.name.getText(sourceFile);

        if (name === 'onClick' || name.toLowerCase() === 'onclick') {
          hasOnClick = true;
          const text = prop.initializer ? prop.initializer.getText(sourceFile) : '';
          if (text.includes('() => {}') || text.includes('()=>{}') || text.includes('undefined')) {
            isNoOpHandler = true;
          }
        } else if (name === 'href') {
          hasHref = true;
          const text = prop.initializer ? prop.initializer.getText(sourceFile) : '';
          if (text === '"#"' || text === "'#'") {
            isNoOpHandler = true;
          }
        } else if (name === 'type') {
          const text = prop.initializer ? prop.initializer.getText(sourceFile) : '';
          if (text === '"submit"' || text === "'submit'") {
            hasTypeSubmit = true;
          }
        } else if (name === 'disabled') {
          isDisabled = true;
        }
      }

      if ((!hasOnClick && !hasHref && !hasTypeSubmit && !isDisabled) || isNoOpHandler) {
        const loc = parsed!.getLocation(opening);
        const reason = isNoOpHandler
          ? 'Button has an empty placeholder or dummy "#" handler.'
          : 'Button has no onClick handler, href destination, or submit type.';

        findings.push({
          ruleId: 'ID-004',
          message: 'Interactive button has no functional outcome or event handler.',
          description: reason,
          severity: 'warning',
          confidence: 0.95,
          location: loc,
          findingType: 'problem',
          diagnosis: 'Action button lacks a functional handler or navigation target.',
          recommendation: 'Provide an onClick handler or add disabled attribute until implemented.',
          structuredRecommendation: {
            summary: 'Connect button to business logic or set disabled={true}.',
            rationale: 'Unresponsive buttons break user expectation and flow.',
          },
          supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
          evidence: [
            astEvidence(
              `${reason} Element: "${opening.getText(sourceFile)}"`,
              loc,
              opening.getText(sourceFile)
            ),
          ],
          fix: {
            title: 'Add disabled state until handler is implemented',
            kind: 'assisted',
            changes: [
              {
                range: parsed!.getLocation(opening.tagName),
                newText: `${opening.tagName.getText(sourceFile)} disabled`,
                before: opening.tagName.getText(sourceFile),
              },
            ],
          },
        });
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
