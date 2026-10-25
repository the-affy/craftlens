import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const TY_003_RULE: CraftLensRule = {
  id: 'TY-003',
  category: 'visual',
  title: 'Excessive All-Caps Typography',
  problemTitle: 'Excessive all-caps typography',
  description: 'Widespread use of uppercase text-transform across body content, subtitles, or large blocks of text.',
  rationale: 'All-caps text lacks ascenders and descenders, creating a uniform rectangular word shape that reduces reading speed by 10-20%. Reserve all-caps strictly for 1-2 word metadata micro-labels.',
  whatIsWrong: 'Uppercase text transformation is applied to multi-word labels or body text.',
  whyItMatters: 'Reduces reading legibility, increases cognitive effort, and creates an aggressive visual tone.',
  howToFix: 'Use standard sentence case or title case, reserving uppercase exclusively for short (1-2 word) micro-labels.',
  severity: 'suggestion',
  confidence: 0.87,
  engine: 'css',
  recommendation: 'Use sentence case for labels and body text instead of all-caps.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['typography', 'all-caps', 'legibility', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const uppercaseRegex = /\b(uppercase\s+tracking-(?:wider|widest)|text-transform:\s*uppercase)/g;

    const lines = context.sourceCode.split('\n');
    let count = 0;
    let firstLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match: RegExpExecArray | null;
      while ((match = uppercaseRegex.exec(line)) !== null) {
        count++;
        if (firstLine === 0) firstLine = i + 1;
      }
    }

    if (count >= 3) {
      const location = createLocation(context.filePath, firstLine, 1, 0, firstLine, 1, 0);
      findings.push({
        ruleId: 'TY-003',
        problemTitle: 'Excessive all-caps typography',
        message: `${count} instances of all-caps text-transform used in component.`,
        whatIsWrong: 'Widespread all-caps styling across multiple elements reduces reading comfort.',
        whyItMatters: 'All-caps text removes distinct letter contours, slowing reading comprehension and fatiguing users.',
        howToFix: 'Convert labels to sentence case with medium font weight rather than uppercase.',
        severity: 'suggestion',
        confidence: 0.87,
        location,
        findingType: 'suggestion',
        evidence: [
          regexEvidence(`Detected ${count} uppercase text-transform occurrences`, location),
          {
            type: 'rule',
            explanation: 'Repeated uppercase styling across >= 3 labels',
          },
        ],
        supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
      });
    }

    return findings;
  },
};
