import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  regexEvidence,
  SourceLocation,
} from '@craftlens/core';
import { CssAnalyzer } from '@craftlens/design-intelligence';

export const CX_005_RULE: CraftLensRule = {
  id: 'CX-005',
  category: 'css',
  title: 'Border Radius Violates System',
  description: 'Arbitrary corner radius outside project design system scale is introduced.',
  rationale:
    'Corner radius establishes the overall tactile character of the product. Arbitrary corner radii create visual discordance across cards, buttons, and dialogs.',
  severity: 'suggestion',
  confidence: 0.9,
  engine: 'css',
  recommendation: 'Replace arbitrary border radius with an approved project radius token.',
  fix: 'assisted',
  platforms: ['react', 'web', 'typescript', 'javascript'],
  tags: ['consistency', 'design-tokens', 'radius', 'css', 'tailwind'],
  minimumAuditLevel: 'moderate',
  diagnosis: 'Arbitrary border radius outside project design scale.',
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Align corner radius with the project radius system.',
    rationale: 'Prevents mismatched container curvature across pages and components.',
    fix: {
      type: 'assisted',
      description: 'Replace with nearest standard radius token',
    },
  },

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const nonStandard = CssAnalyzer.findNonStandardRadius(
      context.sourceCode,
      context.projectContext.baseline
    );

    for (const item of nonStandard) {
      const loc: SourceLocation = {
        filePath: context.filePath,
        start: { line: item.line, column: item.column, offset: 0 },
        end: { line: item.line, column: item.column + item.raw.length, offset: 0 },
      };

      const replacementText = `rounded-[${item.nearestStandard}px]`;

      findings.push({
        ruleId: 'CX-005',
        message: `Arbitrary border radius "${item.raw}" (${item.value}px) violates project radius scale.`,
        description: `Project radius scale is [${context.projectContext.baseline.radius.join(', ')}px]. Nearest standard radius is ${item.nearestStandard}px.`,
        severity: 'suggestion',
        confidence: 0.9,
        location: loc,
        findingType: 'suggestion',
        diagnosis: `Arbitrary radius value (${item.value}px) violates system tokens.`,
        recommendation: `Use ${item.nearestStandard}px to adhere to the project radius scale.`,
        structuredRecommendation: {
          summary: `Use ${item.nearestStandard}px instead of ${item.value}px.`,
          rationale: 'Creates unified curvature across all surfaces.',
        },
        supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
        evidence: [
          regexEvidence(
            `Found arbitrary radius "${item.raw}". Nearest standard token is ${item.nearestStandard}px.`,
            loc,
            item.raw
          ),
        ],
        fix: {
          title: `Snap to ${item.nearestStandard}px (${replacementText})`,
          kind: 'assisted',
          changes: [
            {
              range: loc,
              newText: replacementText,
              before: item.raw,
            },
          ],
        },
      });
    }

    return findings;
  },
};
