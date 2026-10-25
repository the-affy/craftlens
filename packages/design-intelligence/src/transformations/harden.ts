import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class HardenTransformation implements TransformationDefinition {
  public readonly id = 'harden';
  public readonly name = 'Harden';
  public readonly applicableCategories = ['accessibility' as const, 'component' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    return [
      {
        id: 'harden-accessible-labels',
        title: '01  ACCESSIBLE LABELS & INTERACTIVE AFFORDANCES',
        transformation: 'harden',
        description: 'Provide explicit accessible names and focus rings for interactive elements.',
        whyItFits: [
          'Interactive targets lacking accessible text hinder assistive technology navigation.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Requires descriptive aria-labels or sr-only text nodes.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Add aria-label and visible focus-visible outline tokens.',
        confidence: 0.95,
        scope: 'local',
      },
    ];
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
