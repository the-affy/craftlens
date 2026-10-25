import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class ResponsiveTransformation implements TransformationDefinition {
  public readonly id = 'improve-responsive';
  public readonly name = 'Improve Responsive';
  public readonly applicableCategories = ['responsive' as const, 'layout' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    return [
      {
        id: 'responsive-fluid-grid',
        title: '01  FLUID AUTO-FIT GRID LAYOUT',
        transformation: 'improve-responsive',
        description: 'Replace fixed multi-column layout with fluid auto-fit columns that wrap naturally on smaller viewports.',
        whyItFits: [
          'Fixed column declarations risk horizontal overflow or compressed cards on mobile/tablet widths.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Card count per row may vary based on exact screen width.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Use repeat(auto-fit, minmax(280px, 1fr)) with standard gap spacing.',
        confidence: 0.93,
        scope: 'section',
      },
    ];
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
