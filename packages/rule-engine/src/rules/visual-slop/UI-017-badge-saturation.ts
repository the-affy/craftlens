import { CraftLensRule, Finding, AnalysisContext } from '@craftlens/core';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const UI_017_RULE: CraftLensRule = {
  id: 'UI-017',
  category: 'visual',
  title: 'Badge Saturation',
  problemTitle: 'Badge saturation',
  description: 'Excessive use of status badges and pill-shaped tags for routine data or decorative labels.',
  rationale: 'Badges are intended to signal critical or exceptional states. Overusing them across routine labels creates visual clutter and dilutes alert severity.',
  whatIsWrong: 'Many routine values and decorative labels are formatted as status badges or pills, diluting their signaling power.',
  whyItMatters: 'When everything is styled as a badge, critical operational states (errors, urgent actions) are ignored.',
  howToFix: 'Reserve pills and colored badges for genuine operational statuses. Use plain typographic labels and muted colors for ordinary metadata.',
  severity: 'warning',
  confidence: 0.89,
  engine: 'heuristic',
  recommendation: 'Demote routine badges to clean typographic text with subtle color contrast.',
  fix: 'manual',
  platforms: ['web', 'react'],
  tags: ['visual-slop', 'badges', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
    return report.composition.findings.filter(f => f.ruleId === 'UI-017');
  },
};
