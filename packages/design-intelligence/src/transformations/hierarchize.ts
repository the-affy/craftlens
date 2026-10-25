import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { TransformationDefinition, DesignRecommendationCandidate, ValidationResult } from './types.js';

export class HierarchizeTransformation implements TransformationDefinition {
  public readonly id = 'hierarchize';
  public readonly name = 'Hierarchize';
  public readonly applicableCategories = ['hierarchy' as const, 'visual-repetition' as const, 'layout' as const];
  public readonly prerequisites = [];

  public generateCandidates(context: DesignContext, problem: DesignProblem): DesignRecommendationCandidate[] {
    const candidates: DesignRecommendationCandidate[] = [];
    const count = context.siblingCount || context.contentCount || 6;
    const type = context.contentType || 'service';

    if (context.productType === 'marketing' || context.pageType === 'services' || type === 'services') {
      candidates.push({
        id: 'hierarchize-feature-list',
        title: '01  FEATURE + SECONDARY LIST',
        transformation: 'hierarchize',
        description: `Make one ${type} the visual anchor and turn the remaining ${type}s into a compact list.`,
        whyItFits: [
          'The current cards all have identical visual weight, but the content does not require equal emphasis.',
          `Content consists of ${count} informational items that benefit from an established focal point.`,
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Less uniformity, stronger hierarchy.',
        affectedElements: problem.affectedElements,
        implementationApproach: `Feature the primary ${type} card with elevated styling or expanded width, and render secondary items with subtle divider lines.`,
        confidence: 0.91,
        scope: 'section',
      });
    } else if (context.productType === 'dashboard') {
      candidates.push({
        id: 'hierarchize-primary-secondary-metrics',
        title: '01  PRIMARY KPI ANCHOR + SUPPORTING METRICS',
        transformation: 'hierarchize',
        description: 'Elevate the primary operational metric and display secondary metrics in a compact summary row.',
        whyItFits: [
          'All metric tiles currently look identical, preventing users from quickly spotting what needs attention.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Secondary metrics receive less horizontal canvas space.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Use high-contrast large typography for primary KPI and lightweight compact cards for supporting numbers.',
        confidence: 0.92,
        scope: 'section',
      });
    } else {
      candidates.push({
        id: 'hierarchize-focal-point',
        title: '01  ESTABLISH PRIMARY FOCAL POINT',
        transformation: 'hierarchize',
        description: 'Create a clear visual anchor to establish which element should be read first.',
        whyItFits: [
          'Uniform visual weight across items flattens the hierarchy and increases cognitive load.',
        ],
        evidence: problem.evidence.slice(0, 5),
        tradeoff: 'Sacrifices rigid symmetry for scannability.',
        affectedElements: problem.affectedElements,
        implementationApproach: 'Vary the scale and emphasis of the lead item.',
        confidence: 0.88,
        scope: 'component',
      });
    }

    return candidates;
  }

  public validate(candidate: DesignRecommendationCandidate, context: DesignContext): ValidationResult {
    if (!candidate.whyItFits || candidate.whyItFits.length === 0) {
      return { valid: false, reason: 'Missing contextual rationale for why hierarchy fits.' };
    }
    return { valid: true };
  }
}
