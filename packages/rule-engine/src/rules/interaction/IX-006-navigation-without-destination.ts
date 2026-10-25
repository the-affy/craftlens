import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const IX_006_RULE: CraftLensRule = {
  id: 'IX-006',
  category: 'interaction',
  title: 'Navigation Without Destination',
  problemTitle: 'Anchor without meaningful destination',
  description: 'Anchor link <a> configured with href="#" or href="javascript:void(0)" instead of a meaningful URL or button role.',
  rationale: 'Using href="#" causes unexpected page jumps to top and confuses screen readers. If an element triggers an action rather than navigating, it must be a <button>.',
  whatIsWrong: 'Anchor element uses href="#" or lacks a valid URL target.',
  whyItMatters: 'Jumps page to top, breaks tab navigation, and prevents users from opening link in new tab.',
  howToFix: 'If triggering an action, convert <a> to <button type="button">. If navigating, provide a valid URL route.',
  severity: 'warning',
  confidence: 0.93,
  engine: 'regex',
  recommendation: 'Use <button> for actions and valid href for navigation.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['interaction', 'navigation', 'accessibility', 'ux'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const linkRegex = /<a\b[^>]*href=["'](?:#|javascript:void\(0\)|)["'][^>]*>/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, startCol + match[0].length, 0);

        findings.push({
          ruleId: 'IX-006',
          problemTitle: 'Anchor without meaningful destination',
          message: 'Anchor tag uses dummy href="#" without destination.',
          whatIsWrong: 'Link uses placeholder destination href="#" instead of a real destination or <button>.',
          whyItMatters: 'Breaks browser navigation semantics, scroll position, and keyboard accessibility.',
          howToFix: 'Convert to <button type="button"> if this triggers a JS callback, or provide a real route.',
          severity: 'warning',
          confidence: 0.93,
          location,
          findingType: 'problem',
          evidence: [
            regexEvidence(`Placeholder link pattern: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'Dummy anchor tag masquerading as button action',
            },
          ],
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
