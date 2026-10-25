import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class DistillTransformation implements TransformationDefinition {
  public readonly id = 'distill';
  public readonly name = 'Distill';
  public readonly applicableCategories = [
    'visual-repetition' as const,
    'hierarchy' as const,
    'layout' as const,
    'component' as const,
  ];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    const candidates: DesignRecommendationCandidate[] = [];
    const type = context.contentType || 'service';

    if (context.productType === 'marketing' || context.pageType === 'services' || type === 'services') {
      candidates.push({
        id: 'distill-editorial-grid',
        title: '02  EDITORIAL SERVICE GRID',
        transformation: 'distill',
        description: `Keep the grid but remove the repeated container treatment and use typography and spacing to separate ${type}s.`,
        whyItFits: [
          'The existing content is short and informational.',
          'Heavy container borders and background boxes add visual clutter without aiding readability.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Less conventional card affordance.',
        affectedElements: problem.affectedElements,
        implementationApproach: `Remove outer border, background box, and shadow from ${problem.affectedElements[0] || '.service-box'}; rely on 24-32px grid gaps and bold headings for structure.`,
        confidence: 0.87,
        scope: 'component',
      });
    } else if (context.productType === 'dashboard') {
      candidates.push({
        id: 'distill-borderless-metrics',
        title: '02  BORDERLESS STATISTIC TILES',
        transformation: 'distill',
        description: 'Strip the box containers and rely on generous whitespace and subtle divider rules.',
        whyItFits: [
          'Dense repetitive card surfaces make the screen feel heavy and boxed-in.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Requires disciplined margin and baseline alignment.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Remove card backgrounds and use light vertical border separators.',
        confidence: 0.85,
        scope: 'component',
      });
    } else {
      candidates.push({
        id: 'distill-container-unwrap',
        title: '02  REMOVE CONTAINER NOISE',
        transformation: 'distill',
        description: 'Unwrap redundant container boxes and structure content through typography and spacing rhythm.',
        whyItFits: [
          'Excessive nested box styling creates visual fatigue without communicating meaning.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Requires clear typographic hierarchy to maintain scanning boundaries.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Replace border/shadow containers with clean spacing.',
        confidence: 0.84,
        scope: 'component',
      });
    }

    return candidates;
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    if (context.productType === 'marketing' && candidate.title.toLowerCase().includes('data table')) {
      return { valid: false, reason: 'Do not recommend data tables for informational marketing copy.' };
    }
    return { valid: true };
  }
}
