import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';
import { inferDesignIntent } from '@craftlens/design-intelligence';

export const ID_001_RULE: CraftLensRule = {
  id: 'ID-001',
  category: 'visual',
  title: 'Decorative Element Without Purpose In Operational Surface',
  description: 'Heavy decorative blur, glow, or gradient overlay is present in an operational surface (dashboard, settings, or form).',
  rationale:
    'Marketing surfaces benefit from energetic decoration, but operational dashboards and forms require crisp contrast, low cognitive noise, and fast scanning. Gratuitous glow effects reduce readability.',
  severity: 'warning',
  confidence: 0.85,
  engine: 'ast',
  recommendation: 'Remove extraneous decorative blurs and glow overlays to focus attention on data and tasks.',
  fix: 'assisted',
  platforms: ['react', 'web'],
  tags: ['intent', 'visual-design', 'clarity', 'decoration'],
  minimumAuditLevel: 'hard',
  diagnosis: 'Gratuitous decorative glow/blur in an operational interface.',
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Remove decorative background blurs in operational workflows.',
    rationale: 'Operational surfaces prioritize readability, rapid comprehension, and minimal visual noise.',
    fix: {
      type: 'assisted',
      description: 'Remove decorative blur overlay element',
    },
  },

  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) return [];

    const intent = inferDesignIntent({
      filePath: context.filePath,
      sourceCode: context.sourceCode,
    });

    // Only flag in operational surfaces (dashboard, form, settings, monitoring, authentication)
    const operationalIntents = ['dashboard', 'monitoring', 'form', 'settings', 'configuration'];
    if (!operationalIntents.includes(intent.category)) {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;

    function checkElement(node: ts.JsxElement | ts.JsxSelfClosingElement): void {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;

      for (const prop of opening.attributes.properties) {
        if (!ts.isJsxAttribute(prop) || prop.name.getText(sourceFile) !== 'className' || !prop.initializer) {
          continue;
        }

        let cls = '';
        if (ts.isStringLiteral(prop.initializer)) {
          cls = prop.initializer.text;
        }

        const isGratuitousGlow =
          (cls.includes('blur-') || cls.includes('blur ')) &&
          (cls.includes('absolute') || cls.includes('fixed')) &&
          (cls.includes('opacity-') || cls.includes('gradient'));

        if (isGratuitousGlow) {
          const loc = parsed!.getLocation(node);
          findings.push({
            ruleId: 'ID-001',
            message: `Gratuitous decorative glow/blur element detected in ${intent.category} surface.`,
            description: `Surface intent is "${intent.category}". Heavy decorative backdrop blurs introduce noise without aiding data readability or task completion.`,
            severity: 'warning',
            confidence: 0.85,
            location: loc,
            findingType: 'problem',
            diagnosis: `Decorative blur overlay does not serve the functional goals of a ${intent.category} surface.`,
            recommendation: 'Remove the decorative backdrop blur or replace with clean, subtle neutral border.',
            structuredRecommendation: {
              summary: 'Remove gratuitous decorative glow to maximize clarity.',
              rationale: `${intent.category} users need clear contrast and unhindered scannability.`,
            },
            intent,
            supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
            evidence: [
              astEvidence(
                `Found decorative element with classes "${cls}" inside inferred ${intent.category} component.`,
                loc,
                node.getText(sourceFile)
              ),
            ],
            fix: {
              title: 'Remove decorative glow element',
              kind: 'assisted',
              changes: [
                {
                  range: loc,
                  newText: '',
                  before: node.getText(sourceFile),
                },
              ],
            },
          });
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
