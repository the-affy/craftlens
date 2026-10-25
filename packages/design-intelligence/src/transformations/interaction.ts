import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class InteractionTransformation implements TransformationDefinition {
  public readonly id = 'improve-interaction';
  public readonly name = 'Improve Interaction';
  public readonly applicableCategories = ['interaction' as const, 'hierarchy' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    return [
      {
        id: 'interaction-primary-cta-focus',
        title: '01  SINGLE PRIMARY ACTION WITH SUBORDINATE LINKS',
        transformation: 'improve-interaction',
        description: 'Establish one distinct primary button and demote secondary actions to ghost/link variants.',
        whyItFits: [
          'Multiple visually identical primary buttons create choice paralysis and dilute the target conversion path.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Secondary actions have less visual pop.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Retain solid brand background for the primary CTA, and use transparent/borderless styling for secondary options.',
        confidence: 0.94,
        scope: 'local',
      },
    ];
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
