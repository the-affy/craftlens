import { CraftLensRule, Finding, AnalysisContext } from '@craftlens/core';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const UI_014_RULE: CraftLensRule = {
  id: 'UI-014',
  category: 'visual',
  title: 'Visual Treatment Overload',
  problemTitle: 'Visual treatment overload',
  description: 'Component accumulates excessive simultaneous decorative styling treatments (gradient, shadow, border, large radius, glow, badges, animations).',
  rationale: 'Components that combine 5+ decorative treatments become visually loud and dilute interaction states.',
  whatIsWrong: 'This component uses many decorative treatments at the same time.',
  whyItMatters: 'Decorative overload overwhelms users and makes interactive elements look indistinguishable from static content.',
  howToFix: 'Strip unnecessary effects: keep either a border or a subtle shadow, remove ambient glow, and use a calm neutral background.',
  severity: 'warning',
  confidence: 0.88,
  engine: 'heuristic',
  recommendation: 'Simplify container styling and focus visual emphasis on content.',
  fix: 'manual',
  platforms: ['web', 'react'],
  tags: ['visual-slop', 'styling', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
    return report.composition.findings.filter(f => f.ruleId === 'UI-014');
  },
};
