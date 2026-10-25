import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const CX_013_RULE: CraftLensRule = {
  id: 'CX-013',
  category: 'architecture',
  title: 'Existing Component Should Be Reused',
  description: 'Custom element implementation duplicates an existing project component (e.g. Button or Modal).',
  rationale:
    'Creating ad-hoc custom buttons or modals when the project already maintains standard components fragments the design system, violates accessibility standards, and duplicates styling.',
  severity: 'warning',
  confidence: 0.9,
  engine: 'ast',
  recommendation: 'Reuse the existing project component instead of introducing duplicate implementations.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['consistency', 'design-system', 'components', 'reusability'],
  minimumAuditLevel: 'moderate',
  diagnosis: 'Custom implementation duplicates an existing project component.',
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Import and reuse the existing project component.',
    rationale: 'Reusing components maintains design consistency, centralized accessibility, and theme support.',
    fix: {
      type: 'assisted',
      description: 'Replace raw element with shared project component',
    },
  },

  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) return [];

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;
    const currentPath = context.filePath.replace(/\\/g, '/');

    // Find if the project has an existing Button or Modal component
    const discovered = context.projectContext.designSystem?.components || [];
    const detectedBtn = discovered.find(c => c.category === 'button') ||
      (context.projectContext.baseline.components.includes('Button')
        ? { name: 'Button', filePath: 'components/ui/Button.tsx' }
        : null);

    if (!detectedBtn) {
      return [];
    }

    const comp = detectedBtn;

    // Skip if analyzing the Button component file itself!
    if (currentPath.toLowerCase().includes(comp.name.toLowerCase())) {
      return [];
    }

    function checkElement(node: ts.JsxElement | ts.JsxSelfClosingElement): void {

      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = opening.tagName.getText(sourceFile);

      // Check for raw HTML <button> with custom utility button styling
      if (tagName === 'button') {
        let hasCustomStyling = false;
        let className = '';

        for (const prop of opening.attributes.properties) {
          if (ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'className' && prop.initializer) {
            if (ts.isStringLiteral(prop.initializer)) {
              className = prop.initializer.text;
              if (
                (className.includes('px-') || className.includes('py-') || className.includes('p-')) &&
                (className.includes('rounded') || className.includes('bg-')) &&
                (className.includes('font-') || className.includes('text-'))
              ) {
                hasCustomStyling = true;
              }
            }
          }
        }

        if (hasCustomStyling) {
          const loc = parsed!.getLocation(opening);
          const rawTag = opening.tagName.getText(sourceFile);
          const closingTag = ts.isJsxElement(node) ? node.closingElement : null;

          const finding: Finding = {
            ruleId: 'CX-013',
            message: `A ${comp.name} component already exists in this project.`,
            description: `This file creates a custom <button> with ad-hoc styling instead of reusing the project's standard <${comp.name}> component.`,
            severity: 'warning',
            confidence: 0.9,
            location: loc,
            findingType: 'problem',
            diagnosis: `Ad-hoc <button> duplicates existing <${comp.name}> component.`,
            recommendation: `Reuse <${comp.name}> instead of introducing another button implementation.`,
            structuredRecommendation: {
              summary: `Reuse existing <${comp.name}> component.`,
              rationale: `Existing component provides standardized accessibility, keyboard navigation, and theme consistency.`,
              fix: {
                type: 'assisted',
                description: `Replace <button> with <${comp.name}>`,
              },
            },
            supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
            evidence: [
              astEvidence(
                `Found custom styled <button> ("${className}") while "${comp.name}" exists in project (${comp.filePath}).`,
                loc,
                opening.getText(sourceFile)
              ),
            ],
            fix: {
              title: `Replace with project <${comp.name}> component`,
              kind: 'assisted',
              changes: [
                {
                  range: parsed!.getLocation(opening.tagName),
                  newText: comp.name,
                  before: rawTag,
                },
                ...(closingTag
                  ? [
                      {
                        range: parsed!.getLocation(closingTag.tagName),
                        newText: comp.name,
                        before: rawTag,
                      },
                    ]
                  : []),
              ],
            },
          };


          findings.push(finding);
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
