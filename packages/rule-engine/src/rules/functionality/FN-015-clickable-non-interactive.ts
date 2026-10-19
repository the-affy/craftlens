import ts from 'typescript';
import {
  AntiSlopRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@anti-slop/core';
import { ParsedDocument } from '@anti-slop/parser';

export const FN_015_RULE: AntiSlopRule = {
  id: 'FN-015',
  category: 'functionality',
  title: 'Clickable Non-Interactive Element',
  description: 'Generic non-interactive HTML element (<div/> or <span/>) has an onClick listener without keyboard support or button semantics.',
  rationale:
    'AI agents frequently attach click handlers to <div> or <span> elements for quick styling convenience, breaking accessibility, keyboard navigation (Enter/Space keys), and screen readers.',
  severity: 'warning',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Use a semantic <button type="button"> or supply role="button", tabIndex={0}, and an onKeyDown handler.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['accessibility', 'ux', 'interactive', 'a11y', 'ai-patchwork'],
  minimumAuditLevel: 'easy',
  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;

    function checkJsxElement(
      elementNode: ts.JsxOpeningElement | ts.JsxSelfClosingElement
    ): void {
      const tagName = elementNode.tagName.getText(sourceFile);
      if (tagName !== 'div' && tagName !== 'span') {
        return;
      }

      let onClickAttribute: ts.JsxAttribute | undefined;
      let hasRole = false;
      let hasKeyboardHandler = false;
      let isAriaHidden = false;

      for (const prop of elementNode.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const attrName = prop.name.getText(sourceFile);

        if (attrName === 'onClick') {
          onClickAttribute = prop;
        } else if (attrName === 'role') {
          hasRole = true;
        } else if (attrName === 'onKeyDown' || attrName === 'onKeyUp' || attrName === 'onKeyPress') {
          hasKeyboardHandler = true;
        } else if (attrName === 'aria-hidden') {
          isAriaHidden = true;
        }
      }

      if (onClickAttribute && !hasRole && !hasKeyboardHandler && !isAriaHidden) {
        const location = parsed!.getLocation(onClickAttribute);
        const tagLocation = parsed!.getLocation(elementNode.tagName);

        findings.push({
          ruleId: 'FN-015',
          message: `<${tagName}> element has onClick handler but lacks keyboard accessibility and button role.`,
          description:
            `Attaching click listeners to non-interactive <${tagName}> elements without keyboard handlers prevents keyboard-only users from interacting with the control and fails WCAG 2.1 criteria. This implementation introduces a generic/template pattern often produced by AI tools.`,
          severity: 'warning',
          confidence: 0.95,
          location,
          evidence: [
            astEvidence(
              `Found <${tagName}> with onClick attribute but missing role="button" and onKeyDown/onKeyUp.`,
              location,
              elementNode.getText(sourceFile).substring(0, 100)
            ),
          ],
          recommendation: `Convert <${tagName}> to a native <button type="button"> or add role="button" and tabIndex={0} with keyboard handling.`,
          fix: {
            title: `Add role="button" tabIndex={0} to <${tagName}>`,
            kind: 'assisted',
            changes: [
              {
                range: parsed!.getLocation(onClickAttribute),
                newText: `role="button" tabIndex={0} ${onClickAttribute.getText(sourceFile)}`,
              },
            ],
          },
        });
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        checkJsxElement(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
