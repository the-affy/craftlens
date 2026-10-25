import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class TypesetTransformation implements TransformationDefinition {
  public readonly id = 'typeset';
  public readonly name = 'Typeset';
  public readonly applicableCategories = ['typography' as const, 'hierarchy' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    return [
      {
        id: 'typeset-proportional-scale',
        title: '01  ESTABLISH TYPOGRAPHIC SCALE AND WEIGHT CONTRAST',
        transformation: 'typeset',
        description: 'Increase contrast between title and body copy using deliberate font weight and sizing jumps.',
        whyItFits: [
          'Flat font sizes and uniform weights make it difficult to scan content hierarchy.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Headings consume slightly more vertical rhythm.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Elevate title to 1.25rem/semibold and keep body copy at 0.875rem/regular with 1.5 line height.',
        confidence: 0.92,
        scope: 'local',
      },
      {
        id: 'typeset-scannable-lead',
        title: '02  STRUCTURE WITH SCANNABLE LEAD COPY',
        transformation: 'typeset',
        description: 'Lead with concise 2-4 word benefits, followed by muted secondary explanation.',
        whyItFits: [
          'Dense uniform paragraphs without typographic hooks cause reader fatigue.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Requires disciplined editorial brevity.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Split monolithic descriptions into distinct headline + detail elements.',
        confidence: 0.86,
        scope: 'component',
      },
    ];
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    return { valid: true };
  }
}
