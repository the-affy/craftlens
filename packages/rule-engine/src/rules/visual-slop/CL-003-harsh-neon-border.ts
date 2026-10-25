import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';

export const CL_003_RULE: CraftLensRule = {
  id: 'CL-003',
  category: 'visual',
  title: 'Harsh Neon Container Border Slop',
  problemTitle: 'Oversaturated neon border on container',
  description: 'High-saturation neon or primary-tinted border (e.g. border-purple-500 / border-indigo-500) applied around routine static containers or cards.',
  rationale: 'AI generators habitually wrap standard card containers in bright purple, indigo, or pink borders to make them look "futuristic" or "vibrant". In real product design, intense color borders are reserved for active selection, focus-visible states, or error validation; decorating routine cards with them creates visual noise and cheapens the product.',
  whatIsWrong: 'A high-saturation colored border (e.g. border-purple-500) is used as container decoration.',
  whyItMatters: 'Wastes semantic color cues, distracts from interior card content, and produces template-like visual clutter.',
  howToFix: 'Replace the colored border with a grounded neutral border token: "border-slate-200 dark:border-slate-800".',
  severity: 'warning',
  confidence: 0.88,
  engine: 'css',
  recommendation: 'Reserve colored borders for active/selected states; use neutral borders for static cards.',
  fix: 'safe',
  platforms: ['react', 'web'],
  tags: ['ui-slop', 'color', 'border', 'visual'],
  minimumAuditLevel: 'moderate',
  suggestedSteps: [
    'Replace "border-purple-500" or similar with "border-slate-200 dark:border-slate-800".',
  ],
  structuredRecommendation: {
    summary: 'Replace decorative colored border with a disciplined neutral container border.',
    why: 'Saturated borders on routine cards overpower content and degrade visual hierarchy.',
    howToFix: 'Use border-slate-200 dark:border-slate-800 for surface definition.',
    steps: ['Change colored border class to border-slate-200 dark:border-slate-800.'],
    fix: {
      type: 'safe',
      description: 'Use calibrated neutral container border',
    },
  },
  supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const neonBorderRegex = /\b(border-(?:purple|indigo|pink|violet|fuchsia)-[5-7]00)\b/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Skip active / focus / hover / error states
      const lower = lineText.toLowerCase();
      if (
        lower.includes('focus:') ||
        lower.includes('active:') ||
        lower.includes('selected') ||
        lower.includes('error') ||
        lower.includes('invalid')
      ) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = neonBorderRegex.exec(lineText)) !== null) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        const matchedText = match[0];
        const replacement = 'border-slate-200 dark:border-slate-800';

        findings.push({
          ruleId: 'CL-003',
          problemTitle: 'Oversaturated neon border on container',
          message: `Container uses decorative saturated "${matchedText}" border.`,
          whatIsWrong: `High-saturation "${matchedText}" border is applied to a static card, creating visual fatigue.`,
          whyItMatters: 'Competes with meaningful focus/active states and degrades professional aesthetic.',
          howToFix: `Replace "${matchedText}" with "${replacement}".`,
          severity: 'warning',
          confidence: 0.88,
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
            id: `fix-cl-003-${i}-${startCol}`,
            title: `Replace "${matchedText}" with neutral border`,
            description: `Change "${matchedText}" to "${replacement}" for clean surface structure without visual clutter.`,
            changes: [
              {
                range: location,
                after: replacement,
                before: matchedText,
                explanation: 'Grounded neutral container border',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            regexEvidence(`Saturated border token: "${matchedText}"`, location),
            {
              type: 'rule',
              explanation: 'Cosmetic colored border on static container',
            },
          ],
          supportedActions: ['fix', 'preview', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
