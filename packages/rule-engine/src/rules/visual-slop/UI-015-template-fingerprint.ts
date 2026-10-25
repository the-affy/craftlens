import { CraftLensRule, Finding, AnalysisContext } from '@craftlens/core';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const UI_015_RULE: CraftLensRule = {
  id: 'UI-015',
  category: 'hierarchy',
  title: 'Generic Template-Driven Composition',
  problemTitle: 'Generic template-driven composition',
  description: 'Page structure matches a recognized generic scaffolding template (e.g. SaaS landing page or boilerplate dashboard formula).',
  rationale: 'Generic template fingerprints signal that the interface was generated from an AI scaffold rather than composed around specific user workflows.',
  whatIsWrong: 'The layout follows a textbook AI template structure without distinct product domain identity.',
  whyItMatters: 'Template layouts flatten user interest and fail to highlight the specific workflow value of the product.',
  howToFix: 'Structure the page around your real product workflow or data model rather than boilerplate feature cards.',
  severity: 'warning',
  confidence: 0.92,
  engine: 'heuristic',
  recommendation: 'Replace generic scaffolding with task-oriented workflows and real content previews.',
  fix: 'manual',
  platforms: ['web', 'react'],
  tags: ['layout', 'template', 'ui', 'architecture'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
    return report.composition.findings.filter(f => f.ruleId === 'UI-015');
  },
};
