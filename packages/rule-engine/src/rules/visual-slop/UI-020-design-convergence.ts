import { CraftLensRule, Finding, AnalysisContext } from '@craftlens/core';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const UI_020_RULE: CraftLensRule = {
  id: 'UI-020',
  category: 'design',
  title: 'Design Convergence Detected',
  problemTitle: 'Design convergence detected',
  description: 'The exact same decorative recipe (gradient + ambient glow + rounded cards) is copy-pasted across unrelated screens.',
  rationale: 'Reusing identical decorative treatments across disparate views (dashboard, settings, profile, analytics) flattens product architecture.',
  whatIsWrong: 'The same decorative recipe appears across unrelated screens.',
  whyItMatters: 'It makes the interface feel template-driven rather than intentionally composed for each distinct task.',
  howToFix: 'Differentiate screens by task. Reserve rich hero moments for landing views and make work surfaces calm and dense.',
  severity: 'warning',
  confidence: 0.88,
  engine: 'heuristic',
  recommendation: 'Tailor visual layout and hierarchy to the specific intent of each screen.',
  fix: 'manual',
  platforms: ['web', 'react'],
  tags: ['design-system', 'convergence', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
    return report.context.convergenceFindings.filter(f => f.ruleId === 'UI-020');
  },
};
