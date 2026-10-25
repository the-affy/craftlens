import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

const INPUT_TAGS = new Set(['input', 'textarea', 'select']);
const NON_TEXT_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset']);

export const UX_018_RULE: CraftLensRule = {
  id: 'UX-018',
  category: 'accessibility',
  title: 'Form Field Relies Solely on Placeholder',
  description: 'An input or textarea uses a placeholder as its only identifier without a persistent accessible label or aria-label.',
  rationale:
    'AI models frequently omit form labels and use placeholder="Enter email..." as a visual shortcut. Placeholders disappear once text is typed, making review impossible, and many screen readers do not announce placeholders as accessible names (violates WCAG 2.1 SC 3.3.2 and 1.3.1).',
  severity: 'warning',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Provide an explicit <label htmlFor="..."> or add an aria-label attribute.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['ux-slop', 'forms', 'accessibility', 'wcag', 'a11y'],
  minimumAuditLevel: 'moderate',
  problemTitle: 'Form Input Labeling',
  whatIsWrong: 'Input element uses a placeholder without a persistent label or aria-label.',
  whyItMatters:
    'Disappearing placeholders cause cognitive friction when users cannot recall what information is expected after typing. Assistive technologies frequently fail to announce fields with only placeholders.',
  howToFix:
    'Add an explicit <label htmlFor="field-id">Field Name</label> or provide an aria-label="Field Name" on the input.',
  suggestedSteps: [
    'Add a visible <label htmlFor={id}> above or alongside the input.',
    'If minimal design prevents a visible label, add an aria-label="Description" or visually hidden label.',
    'Use placeholder text only for formatting examples (e.g. "e.g. user@domain.com"), not as the field description.',
  ],
  structuredRecommendation: {
    summary: 'Add an accessible label or aria-label to form fields.',
    why: 'Placeholders disappear upon typing and fail WCAG 2.1 SC 3.3.2 accessibility guidelines.',
    howToFix: 'Associate a label with the input using htmlFor/id or attach an aria-label.',
    steps: [
      'Add a visible <label htmlFor="field-id">Label</label>.',
      'Or add aria-label="Field Name" directly to the input tag.',
    ],
    fix: {
      type: 'assisted',
      description: 'Add aria-label attribute to input',
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

    // Collect all labeled ids in this file
    const labeledIds = new Set<string>();

    function collectLabels(node: ts.Node): void {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(sourceFile);
        if (tagName === 'label') {
          for (const prop of node.attributes.properties) {
            if (ts.isJsxAttribute(prop) && (prop.name.getText(sourceFile) === 'htmlFor' || prop.name.getText(sourceFile) === 'for')) {
              if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
                labeledIds.add(prop.initializer.text);
              }
            }
          }
        }
      }
      ts.forEachChild(node, collectLabels);
    }

    collectLabels(sourceFile);

    function checkNode(node: ts.Node, parentLabel: boolean): void {
      let isInsideLabel = parentLabel;
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === 'label') {
        isInsideLabel = true;
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(sourceFile);
        if (INPUT_TAGS.has(tagName) && !isInsideLabel) {
          let hasPlaceholder = false;
          let hasAriaLabel = false;
          let hasAriaLabelledBy = false;
          let hasTitle = false;
          let inputType = 'text';
          let inputId: string | undefined;

          for (const prop of node.attributes.properties) {
            if (!ts.isJsxAttribute(prop)) continue;
            const attrName = prop.name.getText(sourceFile);
            if (attrName === 'placeholder') {
              hasPlaceholder = true;
            } else if (attrName === 'aria-label') {
              hasAriaLabel = true;
            } else if (attrName === 'aria-labelledby') {
              hasAriaLabelledBy = true;
            } else if (attrName === 'title') {
              hasTitle = true;
            } else if (attrName === 'id') {
              if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
                inputId = prop.initializer.text;
              }
            } else if (attrName === 'type') {
              if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
                inputType = prop.initializer.text.toLowerCase();
              }
            }
          }

          const isNonTextInput = NON_TEXT_INPUT_TYPES.has(inputType);
          const hasAssociatedLabel = inputId ? labeledIds.has(inputId) : false;

          if (hasPlaceholder && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle && !hasAssociatedLabel && !isNonTextInput) {
            const location = parsed!.getLocation(node);
            const originalNodeText = node.getText(sourceFile);
            let placeholderVal = 'Input field';
            for (const prop of node.attributes.properties) {
              if (ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'placeholder' && prop.initializer && ts.isStringLiteral(prop.initializer)) {
                placeholderVal = prop.initializer.text;
              }
            }

            const isSelfClosing = ts.isJsxSelfClosingElement(node);
            const newNodeText = isSelfClosing
              ? originalNodeText.replace(/\s*\/>$/, ` aria-label="${placeholderVal}" />`)
              : originalNodeText.replace(new RegExp(`^<${tagName}`), `<${tagName} aria-label="${placeholderVal}"`);

            findings.push({
              ruleId: 'UX-018',
              message: `<${tagName}> uses placeholder without a persistent label or aria-label.`,
              description:
                `A form control uses a placeholder as its only identifier. When users begin typing, placeholders disappear, increasing cognitive load and causing accessibility failures under WCAG 2.1 SC 3.3.2.`,
              severity: 'warning',
              confidence: 0.95,
              location,
              problemTitle: 'Form Input Labeling',
              whatIsWrong: `<${tagName}> lacks an associated label or aria-label, relying only on placeholder.`,
              whyItMatters:
                'Disappearing placeholders leave users unable to verify field contents, and screen readers cannot properly name the field.',
              howToFix:
                `Add a <label htmlFor="${inputId || 'field'}"> or add aria-label to the <${tagName}>.`,
              suggestedSteps: [
                'Attach an accessible label or aria-label to the input.',
                'Keep the placeholder purely for format hints.',
              ],
              fix: {
                title: `Add aria-label="${placeholderVal}"`,
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
                id: `fix-ux-018-${location.start.line}`,
                title: `Add accessible label`,
                description: `Add aria-label="${placeholderVal}" to identify the input for screen readers and accessibility tools.`,
                changes: [
                  {
                    range: location,
                    after: newNodeText,
                    before: originalNodeText,
                    explanation: 'Accessible input labeling',
                  },
                ],
                safety: 'safe',
                isPreferred: true,
              },
              evidence: [
                astEvidence(
                  `<${tagName}> has placeholder but no label or aria-label at line ${location.start.line}.`,
                  location,
                  node.getText(sourceFile).slice(0, 150)
                ),
              ],
            });
          }
        }
      }

      ts.forEachChild(node, child => checkNode(child, isInsideLabel));
    }

    checkNode(sourceFile, false);
    return findings;
  },
};
