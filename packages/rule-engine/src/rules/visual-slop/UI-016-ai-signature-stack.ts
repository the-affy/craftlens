import { CraftLensRule, Finding, AnalysisContext } from '@craftlens/core';
import { UIAnalyzer } from '@craftlens/design-intelligence';

export const UI_016_RULE: CraftLensRule = {
  id: 'UI-016',
  category: 'visual',
  title: 'Strong Template-Like Visual Pattern',
  problemTitle: 'Strong template-like visual pattern',
  description: 'High-confidence combination of correlated template-like design hallmarks (purple gradients, glow auras, sparkles, repetitive rounded cards, and generic CTAs).',
  rationale: 'While individual design techniques may be acceptable in isolation, their concurrent combination is the defining signature of generic boilerplate templates.',
  whatIsWrong: 'Several visual tropes associated with boilerplate templates are stacked together across the view.',
  whyItMatters: 'Stacking these decorative tropes makes the application feel like an unverified prototype rather than dependable software.',
  howToFix: 'Remove cosmetic glow blobs and sparkle icons, adopt grounded surface tokens, and strengthen typographic hierarchy.',
  severity: 'warning',
  confidence: 0.95,
  engine: 'heuristic',
  recommendation: 'Strip cosmetic filler and replace generic template tropes with grounded product design system tokens.',
  fix: 'manual',
  platforms: ['web', 'react'],
  tags: ['visual-slop', 'ai-stack', 'ui'],
  supportedActions: ['suggest_better_design', 'explain', 'not_a_problem'],

  detect(context: AnalysisContext): Finding[] {
    const report = UIAnalyzer.analyze(context.filePath, context.sourceCode);
    return report.composition.findings.filter(f => f.ruleId === 'UI-016');
  },
};
