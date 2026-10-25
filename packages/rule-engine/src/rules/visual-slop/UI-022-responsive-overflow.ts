import { CraftLensRule, Finding, AnalysisContext } from '@craftlens/core';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const UI_022_RULE: CraftLensRule = {
  id: 'UI-022',
  category: 'css',
  title: 'Fixed Container Width Breaks Mobile Viewport',
  problemTitle: 'Fixed container width breaks mobile viewport',
  description: 'Major container specifies a hardcoded width (e.g. w-[1200px]) without responsive constraints, causing horizontal overflow.',
  rationale: 'Fixed width containers break responsive layout on tablet and mobile viewports, forcing awkward horizontal scrolling and clipping controls.',
  whatIsWrong: 'Container has hardcoded width without responsive constraints.',
  whyItMatters: 'Horizontal scrolling on smaller screens disorients users and clips interactive controls.',
  howToFix: 'Use max-width with fluid width: replace fixed width with w-full max-w-5xl px-4.',
  severity: 'warning',
  confidence: 0.93,
  engine: 'css',
  recommendation: 'Use max-width and percentage widths instead of hardcoded fixed pixels.',
  fix: 'manual',
  platforms: ['web', 'react'],
  tags: ['css', 'responsive', 'viewport', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
    return report.render.findings.filter(f => f.ruleId === 'UI-022');
  },
};
