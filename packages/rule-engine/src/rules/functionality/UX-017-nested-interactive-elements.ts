import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

const INTERACTIVE_CONTAINERS = new Set(['button', 'Button', 'a', 'Link', 'NavLink']);

export const UX_017_RULE: CraftLensRule = {
  id: 'UX-017',
  category: 'ux',
  title: 'Nested Interactive Elements',
  description: 'A clickable interactive element (<button> or <a>) is nested inside another interactive element, breaking DOM semantics and accessibility.',
  rationale:
    'HTML5 specifications strictly forbid nesting interactive elements. AI-generated code frequently wraps <a> tags inside <button> or vice-versa to combine navigation with button styles. This disrupts screen reader accessibility trees, creates conflicting event bubbles, causes focus ring glitches, and breaks middle-click/right-click browser behaviors.',
  severity: 'error',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Remove the nested interactive control. Style the anchor directly or use a single button with programmatic navigation.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['ux-slop', 'accessibility', 'interaction', 'html-validity', 'buttons'],
  minimumAuditLevel: 'easy',
  problemTitle: 'Nested Interactive Elements',
  whatIsWrong: 'A clickable control is nested inside another clickable control (e.g. <button> inside <a> or <a> inside <button>).',
  whyItMatters:
    'HTML5 forbids nesting interactive controls. Screen readers cannot reliably announce nested interactive roles, keyboard tab order breaks, and click events fire unpredictably.',
  howToFix:
    'Keep only one interactive element: style the <a> tag as a button, or use a single <button> with an onClick router navigation handler.',
  suggestedSteps: [
    'Remove the inner button element and apply button styling classes directly to the link.',
    'Or replace the outer link with an accessible button that handles navigation in onClick.',
    'Ensure only one focusable element handles keyboard activation and mouse clicks.',
  ],
  structuredRecommendation: {
    summary: 'Eliminate nested interactive elements by styling the link or using an action button.',
    why: 'Nested interactive elements break HTML5 validity, keyboard navigation, and screen reader announcements.',
    howToFix: 'Remove either the outer or inner interactive tag and preserve single-control focusability.',
    steps: [
      'Remove the inner button and apply styling directly to the <a> or <Link>.',
      'Or use a single <button> with an onClick navigation callback.',
    ],
    fix: {
      type: 'assisted',
      description: 'Remove nested button inside link or style anchor directly',
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

    function getTagName(node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxOpeningElement): string {
      if (ts.isJsxElement(node)) {
        return node.openingElement.tagName.getText(sourceFile);
      }
      return node.tagName.getText(sourceFile);
    }

    function checkChildren(outerTag: string, children: ts.NodeArray<ts.JsxChild>, outerNode: ts.JsxElement) {
      for (const child of children) {
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
          const innerTag = getTagName(child);
          const isOuterBtn = outerTag === 'button' || outerTag === 'Button';
          const isOuterLink = outerTag === 'a' || outerTag === 'Link' || outerTag === 'NavLink';
          const isInnerBtn = innerTag === 'button' || innerTag === 'Button';
          const isInnerLink = innerTag === 'a' || innerTag === 'Link' || innerTag === 'NavLink';

          if ((isOuterBtn && (isInnerLink || isInnerBtn)) || (isOuterLink && (isInnerBtn || isInnerLink))) {
            const location = parsed!.getLocation(child);
            const outerLocation = parsed!.getLocation(outerNode.openingElement);

            findings.push({
              ruleId: 'UX-017',
              message: `Nested interactive element: <${innerTag}> placed inside <${outerTag}>.`,
              description:
                `A <${innerTag}> element is nested within an interactive <${outerTag}>. HTML5 disallows nested interactive controls. This pattern commonly causes ghost clicks, focus trapped states, and broken screen reader announcements.`,
              severity: 'error',
              confidence: 0.95,
              location,
              problemTitle: 'Nested Interactive Elements',
              whatIsWrong: `Nested <${innerTag}> inside <${outerTag}> creates invalid HTML and conflicting click targets.`,
              whyItMatters:
                'HTML5 interactive content must not have interactive content descendants. This breaks screen readers, middle-click navigation, and keyboard focus.',
              howToFix:
                `Remove <${innerTag}> and apply styling directly to <${outerTag}>, or use a single interactive control.`,
              suggestedSteps: [
                `Remove the inner <${innerTag}> tag.`,
                `Apply any button styles directly to the outer <${outerTag}>.`,
              ],
              evidence: [
                astEvidence(
                  `Nested <${innerTag}> detected inside <${outerTag}> at line ${location.start.line}.`,
                  location,
                  child.getText(sourceFile).slice(0, 150)
                ),
              ],
            });
          }

          if (ts.isJsxElement(child)) {
            checkChildren(outerTag, child.children, outerNode);
          }
        }
      }
    }

    function visit(node: ts.Node): void {
      if (ts.isJsxElement(node)) {
        const outerTag = getTagName(node);
        if (INTERACTIVE_CONTAINERS.has(outerTag)) {
          checkChildren(outerTag, node.children, node);
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
