import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const UX_019_RULE: CraftLensRule = {
  id: 'UX-019',
  category: 'functionality',
  title: 'Unspecified Button Type Inside Form',
  description: 'A <button> element inside a form does not declare an explicit type attribute, causing it to default to type="submit".',
  rationale:
    'In HTML, <button> elements default to type="submit". AI coding models frequently add buttons (such as "Cancel", "Back", "Reset", or modal closers) inside <form> tags without specifying type="button". Clicking these buttons unintentionally triggers form submission, network requests, validation errors, and page reloads.',
  severity: 'warning',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Explicitly specify type="button" for secondary actions or type="submit" for primary submissions.',
  fix: 'safe',
  platforms: ['react', 'web'],
  tags: ['ux-slop', 'forms', 'buttons', 'behavior'],
  minimumAuditLevel: 'easy',
  problemTitle: 'Button Form Behavior',
  whatIsWrong: '<button> inside a form defaults to type="submit" because no explicit type is defined.',
  whyItMatters:
    'Secondary actions like Cancel or Close inadvertently submit the form, triggering premature validation errors, API calls, or unwanted page refreshes.',
  howToFix:
    'Add type="button" to non-submitting buttons, or type="submit" if intentional.',
  suggestedSteps: [
    'Add type="button" to buttons that perform custom onClick operations without submitting.',
    'Add type="submit" to explicit submission buttons for semantic clarity.',
  ],
  structuredRecommendation: {
    summary: 'Add explicit type attribute to button elements inside forms.',
    why: 'HTML buttons default to type="submit" and cause unintended form submission on click.',
    howToFix: 'Specify type="button" on non-submitting action buttons.',
    steps: [
      'Add type="button" to the button element.',
    ],
    fix: {
      type: 'safe',
      description: 'Add type="button" to <button>',
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

    function checkNode(node: ts.Node, insideForm: boolean): void {
      let isForm = insideForm;
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === 'form') {
        isForm = true;
      }

      if (isForm && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
        const tagName = node.tagName.getText(sourceFile);
        if (tagName === 'button') {
          let hasType = false;

          for (const prop of node.attributes.properties) {
            if (ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'type') {
              hasType = true;
              break;
            }
          }

          if (!hasType) {
            const location = parsed!.getLocation(node);
            const buttonText = node.parent && ts.isJsxElement(node.parent)
              ? node.parent.children.map(c => c.getText(sourceFile)).join('').trim()
              : '';

            findings.push({
              ruleId: 'UX-019',
              message: `<button> inside <form> lacks an explicit type attribute and defaults to type="submit".`,
              description:
                `A <button> element inside a form does not specify type="button". In HTML, buttons default to type="submit", causing secondary actions or cancel buttons to trigger form submission.`,
              severity: 'warning',
              confidence: 0.95,
              location,
              problemTitle: 'Button Form Behavior',
              whatIsWrong: `<button> inside <form> lacks an explicit type attribute and defaults to type="submit".`,
              whyItMatters:
                'Clicking non-submit buttons inside a form triggers accidental form submission and validation errors.',
              howToFix:
                'Add type="button" to the <button> element.',
              suggestedSteps: [
                'Add type="button" to the button tag.',
              ],
              fix: {
                title: 'Add type="button"',
                kind: 'safe',
                changes: [
                  {
                    range: {
                      filePath: location.filePath,
                      start: { line: location.start.line, column: location.start.column + 7, offset: (location.start.offset ?? 0) + 7 },
                      end: { line: location.start.line, column: location.start.column + 7, offset: (location.start.offset ?? 0) + 7 },
                    },
                    newText: ' type="button"',
                  },
                ],
              },
              evidence: [
                astEvidence(
                  `<button> inside <form> lacks type attribute at line ${location.start.line}${buttonText ? ` ("${buttonText}")` : ''}.`,
                  location,
                  node.getText(sourceFile).slice(0, 150)
                ),
              ],
            });
          }
        }
      }

      ts.forEachChild(node, child => checkNode(child, isForm));
    }

    checkNode(sourceFile, false);
    return findings;
  },
};
