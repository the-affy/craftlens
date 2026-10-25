import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class PolishTransformation implements TransformationDefinition {
  public readonly id = 'polish';
  public readonly name = 'Polish';
  public readonly applicableCategories = ['layout' as const, 'component' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    return [
      {
        id: 'polish-token-discipline',
        title: '01  STANDARDIZE CORNER RADII AND SPACING RHYTHM',
        transformation: 'polish',
        description: 'Harmonize mismatched radii and margins to conform to a consistent token scale.',
        whyItFits: [
          'Inconsistent spacing tokens (e.g. mixing 7px, 14px, 22px) create subtle visual roughness.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Strict adherence to an 8pt spacing grid.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Map scattered pixel values to standard tokens (rounded-md, p-4, gap-4).',
        confidence: 0.89,
        scope: 'component',
      },
    ];
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
