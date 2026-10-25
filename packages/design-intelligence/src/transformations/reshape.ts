import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class ReshapeTransformation implements TransformationDefinition {
  public readonly id = 'reshape';
  public readonly name = 'Reshape';
  public readonly applicableCategories = ['layout' as const, 'hierarchy' as const, 'visual-repetition' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    const type = context.contentType || 'feature';
    return [
      {
        id: 'reshape-two-column-editorial',
        title: '02  EDITORIAL TWO-COLUMN COMPOSITION',
        transformation: 'reshape',
        description: `Reorganize the repetitive grid into an asymmetric 2-column layout with strong headline framing.`,
        whyItFits: [
          `The uniform grid creates a repetitive checkerboard pattern across all ${type}s.`,
          'A two-column composition breaks monotony while preserving reading rhythm.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Requires balanced copy lengths between columns.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Use an asymmetric 1fr 2fr grid layout with a sticky section intro on the left.',
        confidence: 0.86,
        scope: 'section',
      },
    ];
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
