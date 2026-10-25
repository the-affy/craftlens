import { CraftLensRule, Finding, AnalysisContext } from '@craftlens/core';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const UI_019_RULE: CraftLensRule = {
  id: 'UI-019',
  category: 'copy',
  title: 'Possible Unsupported Metric',
  problemTitle: 'Possible unsupported metric',
  description: 'Generic placeholder metrics (e.g. 99.9% uptime, 10,000+ users, 4.9/5 stars) or simulated LIVE indicators used as decorative social proof.',
  rationale: 'Unbacked metrics and simulated real-time badges reduce product credibility and signal unverified template scaffolding.',
  whatIsWrong: 'The view contains generic placeholder metrics (e.g. 99.9%, 10,000+ users, LIVE status) without dynamic backing data.',
  whyItMatters: 'Discerning users and buyers recognize generic placeholder statistics, diminishing trust in the product.',
  howToFix: 'Display verifiable, real product usage data or remove vanity stats in favor of concrete feature explanations.',
  severity: 'warning',
  confidence: 0.85,
  engine: 'heuristic',
  recommendation: 'Replace vanity numbers with real metrics or concrete architectural guarantees.',
  fix: 'manual',
  platforms: ['web', 'react'],
  tags: ['copy', 'metrics', 'truth'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
    return report.composition.findings.filter(f => f.ruleId === 'UI-019');
  },
};
