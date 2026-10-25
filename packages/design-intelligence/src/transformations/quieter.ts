import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class QuieterTransformation implements TransformationDefinition {
  public readonly id = 'quieter';
  public readonly name = 'Quieter';
  public readonly applicableCategories = ['color' as const, 'component' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    return [
      {
        id: 'quieter-subtle-elevation',
        title: '01  REDUCE CONTAINER INTENSITY & SHADOW NOISE',
        transformation: 'quieter',
        description: 'Soften aggressive drop shadows and high-contrast borders into subtle 1px neutral borders.',
        whyItFits: [
          'Heavy drop shadows and glowing borders dominate the interface and distract from actual content.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Lower dramatic pop in favor of visual calm.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Replace shadow-2xl or colored box-shadows with subtle border: 1px solid rgba(0,0,0,0.08) or dark equivalent.',
        confidence: 0.90,
        scope: 'component',
      },
    ];
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
