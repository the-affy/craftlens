import { CraftLensRule, Finding, AnalysisContext } from '@craftlens/core';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const UI_013_RULE: CraftLensRule = {
  id: 'UI-013',
  category: 'visual',
  title: 'Trend Stacking',
  problemTitle: 'Trend stacking',
  description: 'Multiple decorative visual trends (gradients, glow, glassmorphism, large radii, soft shadows) applied concurrently without product purpose.',
  rationale: 'Stacking fashionable design effects on routine containers creates visual clutter, slows rendering, and distracts from primary content.',
  whatIsWrong: 'Several decorative visual trends are being used together across the page.',
  whyItMatters: 'The visual styling is competing with actual product data rather than guiding the user toward tasks.',
  howToFix: 'Remove decorative effects that do not communicate state or structure. Rely on clean borders and subtle neutral layering.',
  severity: 'warning',
  confidence: 0.91,
  engine: 'heuristic',
  recommendation: 'Pick one primary aesthetic accent and eliminate redundant decorative treatments.',
  fix: 'manual',
  platforms: ['web', 'react'],
  tags: ['visual-slop', 'trend-stacking', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
    return report.composition.findings.filter(f => f.ruleId === 'UI-013');
  },
};
