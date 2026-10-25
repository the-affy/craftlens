import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  regexEvidence,
  SourceLocation,
} from '@craftlens/core';
import { CssAnalyzer } from '@craftlens/design-intelligence';

export const CX_004_RULE: CraftLensRule = {
  id: 'CX-004',
  category: 'css',
  title: 'Spacing Value Violates Project Scale',
  problemTitle: 'Inconsistent spacing',
  whatIsWrong: 'Arbitrary spacing value outside the project design system scale is used.',
  whyItMatters: 'Arbitrary pixel spacing breaks visual rhythm and causes subtle alignment jitter across views.',
  howToFix: 'Snap spacing to the nearest approved token on the project scale.',
  description: 'Arbitrary spacing value outside the project design system scale is introduced.',
  rationale:
    'Consistent rhythm depends on adhering to a predictable spacing scale (typically a 4px or 8px baseline). Arbitrary one-off spacing values cause visual jitter and erode design consistency.',
  severity: 'suggestion',
  confidence: 0.9,
  engine: 'css',
  recommendation: 'Replace arbitrary spacing with the nearest approved scale value.',
  fix: 'assisted',
  platforms: ['react', 'web', 'typescript', 'javascript'],
  tags: ['consistency', 'design-tokens', 'spacing', 'css', 'tailwind'],
  minimumAuditLevel: 'moderate',
  diagnosis: 'Arbitrary pixel spacing value outside the project baseline.',
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
  structuredRecommendation: {
    summary: 'Snap arbitrary spacing to the nearest project spacing token.',
    rationale: 'Maintains layout rhythm and prevents gradual visual drift across screens.',
    fix: {
      type: 'assisted',
      description: 'Replace with nearest standard spacing token',
    },
  },

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const nonStandard = CssAnalyzer.findNonStandardSpacing(
      context.sourceCode,
      context.projectContext.baseline
    );

    for (const item of nonStandard) {
      const loc: SourceLocation = {
        filePath: context.filePath,
        start: { line: item.line, column: item.column, offset: 0 },
        end: { line: item.line, column: item.column + item.raw.length, offset: 0 },
      };

      const replacementText = `${item.property}-[${item.nearestStandard}px]`;

      findings.push({
        ruleId: 'CX-004',
        problemTitle: 'Inconsistent spacing',
        whatIsWrong: `Spacing value "${item.raw}" (${item.value}px) is outside the project scale.`,
        whyItMatters: 'Arbitrary pixel offsets break visual alignment and create subtle visual jitter.',
        howToFix: `Snap spacing to the nearest project token (${item.nearestStandard}px).`,
        message: `Arbitrary spacing "${item.raw}" (${item.value}px) violates project spacing scale.`,
        description: `Project follows spacing scale [${context.projectContext.baseline.spacing.join(', ')}px]. Nearest standard value is ${item.nearestStandard}px.`,
        severity: 'suggestion',
        confidence: 0.9,
        location: loc,
        findingType: 'suggestion',
        diagnosis: `Arbitrary spacing value (${item.value}px) does not match design system scale.`,
        recommendation: `Snap to ${item.nearestStandard}px to adhere to the project spacing scale.`,
        structuredRecommendation: {
          summary: `Use ${item.nearestStandard}px instead of ${item.value}px.`,
          rationale: 'Keeps layout aligned with the established design system grid.',
        },

        supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
        evidence: [
          regexEvidence(
            `Found arbitrary spacing "${item.raw}". Nearest standard token is ${item.nearestStandard}px.`,
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
