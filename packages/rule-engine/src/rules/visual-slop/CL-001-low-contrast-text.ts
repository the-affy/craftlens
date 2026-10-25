import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const CL_001_RULE: CraftLensRule = {
  id: 'CL-001',
  category: 'visual',
  title: 'Low Contrast Muted Text Slop',
  problemTitle: 'Low-contrast text impairs readability',
  description: 'Body copy or descriptive text uses low-contrast muted gray (e.g. text-gray-400 / #94a3b8) on light or standard backgrounds, failing WCAG contrast standards.',
  rationale: 'AI models frequently output light gray text (such as text-gray-400 or #999) to make non-heading elements look "sleek" or "subtle". On standard light or uncalibrated displays, this drops contrast below WCAG 4.5:1, making content illegible for many users.',
  whatIsWrong: 'Body or descriptive copy uses low-contrast muted color (text-gray-400 / zinc-400), causing readability failure.',
  whyItMatters: 'Text with inadequate contrast strains users\' eyes, fails accessibility compliance (WCAG 2.1 AA), and makes interfaces feel washed out.',
  howToFix: 'Replace washed-out gray text with readable high-contrast tokens such as "text-slate-600 dark:text-slate-300" or semantic muted tokens.',
  severity: 'warning',
  confidence: 0.9,
  engine: 'css',
  recommendation: 'Use calibrated text color with at least 4.5:1 contrast against the surface.',
  fix: 'safe',
  platforms: ['react', 'web'],
  tags: ['ui-slop', 'color', 'contrast', 'accessibility', 'typography'],
  minimumAuditLevel: 'easy',
  suggestedSteps: [
    'Replace "text-gray-400" or "text-zinc-400" with "text-slate-600 dark:text-slate-300".',
  ],
  structuredRecommendation: {
    summary: 'Replace low-contrast muted text with accessible high-contrast text color.',
    why: 'Low-contrast text fails WCAG 4.5:1 contrast requirements and causes severe legibility issues.',
    howToFix: 'Use calibrated slate-600 (or dark:slate-300) for secondary copy.',
    steps: ['Change low-contrast text utility to text-slate-600 dark:text-slate-300.'],
    fix: {
      type: 'safe',
      description: 'Upgrade text to accessible contrast',
    },
  },
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    // Match low contrast gray text utilities on body copy: text-gray-400, text-zinc-400, text-neutral-400, text-slate-400
    const lowContrastRegex = /\b(text-(?:gray|zinc|neutral|slate)-400)\b/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Skip disabled buttons or explicitly inactive items
      const lower = lineText.toLowerCase();
      if (lower.includes('disabled') || lower.includes('placeholder:')) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = lowContrastRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        const matchedText = match[0];
        const replacement = 'text-slate-600 dark:text-slate-300';

        findings.push({
          ruleId: 'CL-001',
          problemTitle: 'Low-contrast text impairs readability',
          message: `Element uses low-contrast "${matchedText}" which fails readability contrast standards.`,
          whatIsWrong: `Text color "${matchedText}" does not provide sufficient contrast for comfortable reading.`,
          whyItMatters: 'Fails WCAG 4.5:1 contrast standards and causes eye strain on standard screens.',
          howToFix: `Replace "${matchedText}" with "${replacement}".`,
          severity: 'warning',
          confidence: 0.9,
          location,
          findingType: 'problem',
          fix: {
            title: `Replace "${matchedText}" with "${replacement}"`,
            kind: 'safe',
            isPreferred: true,
            changes: [
              {
                range: location,
                newText: replacement,
                before: matchedText,
              },
            ],
          },
          designFix: {
            id: `fix-cl-001-${i}-${startCol}`,
            title: `Replace "${matchedText}" with accessible contrast`,
            description: `Upgrade "${matchedText}" to "${replacement}" to meet WCAG AA contrast standards.`,
            changes: [
              {
                range: location,
                after: replacement,
                before: matchedText,
                explanation: 'Ensure readable contrast on all display types',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            regexEvidence(`Low-contrast text token: "${matchedText}"`, location),
            {
              type: 'rule',
              explanation: 'Sub-4.5:1 contrast text utility on content',
            },
          ],
          supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
