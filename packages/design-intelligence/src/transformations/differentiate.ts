import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class DifferentiateTransformation implements TransformationDefinition {
  public readonly id = 'differentiate';
  public readonly name = 'Differentiate';
  public readonly applicableCategories = [
    'visual-repetition' as const,
    'hierarchy' as const,
    'component' as const,
    'interaction' as const,
  ];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    const candidates: DesignRecommendationCandidate[] = [];
    const type = context.contentType || 'service';

    if (context.productType === 'marketing' || context.pageType === 'services' || type === 'services') {
      candidates.push({
        id: 'differentiate-content-role',
        title: '03  DIFFERENTIATE BY CONTENT ROLE',
        transformation: 'differentiate',
        description: 'Keep cards only where interaction or grouping requires them.',
        whyItFits: [
          'Several current cards are informational rather than actionable.',
          'Using identical box affordance for both core offerings and minor details flattens priority.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Requires component-level restructuring.',
        affectedElements: problem.affectedElements,
        implementationApproach: `Group related ${type}s into 2 logical categories with distinct visual weights, reserving card elevation for actionable items.`,
        confidence: 0.82,
        scope: 'section',
      });
    } else if (context.productType === 'dashboard') {
      candidates.push({
        id: 'differentiate-actionable-vs-read',
        title: '03  DIFFERENTIATE ACTIONABLE VS INFORMATIONAL',
        transformation: 'differentiate',
        description: 'Use interactive card treatments only for elements that trigger actions or drills.',
        whyItFits: [
          'Interactive elevation cues on static data tiles mislead users regarding what can be clicked.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Visual language requires two distinct surface styles.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Apply flat neutral styling to passive metrics and subtle hover elevation only to actionable items.',
        confidence: 0.83,
        scope: 'section',
      });
    } else {
      candidates.push({
        id: 'differentiate-role-variants',
        title: '03  DIFFERENTIATE BY USAGE INTENT',
        transformation: 'differentiate',
        description: 'Introduce purpose-built variants instead of one generic container template.',
        whyItFits: [
          'Elements with different user tasks should not share identical visual affordances.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Adds a small number of component variants to maintain.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Define distinct primary, secondary, and informational treatments.',
        confidence: 0.81,
        scope: 'component',
      });
    }

    return candidates;
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
