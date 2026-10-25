import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  createLocation,
  regexEvidence,
} from '@craftlens/core';
import { inferDesignIntent } from '@craftlens/design-intelligence';

export const UI_001_RULE: CraftLensRule = {
  id: 'UI-001',
  category: 'visual',
  title: 'Generic AI Gradient',
  problemTitle: 'Generic gradient decoration',
  description: 'Uncalibrated purple/pink or blue/violet background gradient used as default decoration without communicating structure or hierarchy.',
  rationale: 'Purple-to-pink and violet-to-indigo gradients are ubiquitous in template AI generators. When used across routine containers or cards without brand intent, they flatten contrast and signal boilerplate aesthetics.',
  whatIsWrong: 'Purple/indigo gradient is used as generic background decoration without establishing hierarchy or meaning.',
  whyItMatters: 'Decorative gradients draw disproportionate visual attention to container surfaces instead of content, creating visual fatigue and a template-driven look.',
  howToFix: 'Replace the decorative gradient with a grounded surface color (e.g. subtle border or layered dark background) and reserve color for primary actions or status.',
  severity: 'warning',
  confidence: 0.88,
  engine: 'css',
  recommendation: 'Use clean surface tokens rather than generic AI gradient meshes.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['visual-slop', 'gradient', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];
    const intent = inferDesignIntent({ filePath: context.filePath, sourceCode: context.sourceCode });

    // Detect common generic AI gradient formulas: from-purple-* to-indigo-*, from-violet-* to-pink-*, linear-gradient(#8b5cf6, ...)
    const gradientRegex = /\b(bg-gradient-to-[a-z]+\s+from-(?:purple|violet|fuchsia)-[4-6]00\s+(?:via-[a-z]+-[4-6]00\s+)?to-(?:indigo|pink|blue)-[5-7]00|linear-gradient\([^)]*(?:#8[bB]5[cC][fF]6|#6366[fF]1|#a855[fF]7)[^)]*\))/g;

    const lines = context.sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match: RegExpExecArray | null;
      while ((match = gradientRegex.exec(lineText)) !== null) {
        // Skip if inside an explicit button CTA (gradients on single primary CTA may be acceptable)
        if (lineText.includes('<button') || lineText.includes('Button')) {
          continue;
        }

        // On pure marketing pages, allow hero gradients if purposeful
        if (intent.category === 'marketing' && (lineText.includes('hero') || lineText.includes('Hero'))) {
          continue;
        }

        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;
        const location = createLocation(context.filePath, i + 1, startCol, 0, i + 1, endCol, 0);

        const matchedText = match[0];
        const replacement = matchedText.startsWith('linear-gradient')
          ? '#0f172a'
          : 'bg-slate-900 border border-slate-800';

        findings.push({
          ruleId: 'UI-001',
          problemTitle: 'Generic gradient decoration',
          message: 'Generic purple/indigo gradient used as routine background surface.',
          whatIsWrong: 'Purple/indigo gradient is used as decoration without establishing hierarchy or meaning.',
          whyItMatters: 'Draws disproportionate visual attention to container surfaces instead of content, flattening contrast and signaling template-driven design.',
          howToFix: 'Replace the decorative gradient with a grounded neutral surface token and focus emphasis on content.',
          severity: 'medium' as any,
          confidence: 0.88,
          location,
          findingType: 'problem',
          fix: {
            title: `Replace generic gradient with grounded surface`,
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
            id: `fix-ui-001-${i}-${startCol}`,
            title: 'Use grounded surface instead of AI gradient',
            description: `Replace decorative gradient with grounded neutral surface token "${replacement}".`,
            changes: [
              {
                range: location,
                after: replacement,
                before: matchedText,
                explanation: 'Replace template gradient with cohesive surface token',
              },
            ],
            safety: 'safe',
            isPreferred: true,
          },
          evidence: [
            regexEvidence(`Decorative AI gradient match: "${match[0]}"`, location),
            {
              type: 'rule',
              explanation: 'Purple-to-indigo background gradient on non-action container',
            },
          ],
          supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],
        });
      }
    }

    return findings;
  },
};
