import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { DesignRecommendationCandidate, ValidationResult } from '../transformations/types.js';

export class QualityFilter {
  private static readonly BANNED_GENERIC_PHRASES = [
    'use a clean layout',
    'improve visual hierarchy',
    'consider grouping content',
    'use a modern design',
    'make it more engaging',
    'use better styling',
    'clean up the design',
    'make it pop',
    'elevate user experience',
  ];

  public validate(
    candidate: DesignRecommendationCandidate,
    context: DesignContext,
    problem: DesignProblem,
    existingCandidates: DesignRecommendationCandidate[] = []
  ): ValidationResult {
    return QualityFilter.validate(candidate, context, problem, existingCandidates);
  }

  public static validate(
    candidate: DesignRecommendationCandidate,
    context: DesignContext,
    problem: DesignProblem,
    existingCandidates: DesignRecommendationCandidate[] = []
  ): ValidationResult {
    const textToCheck = `${candidate.title} ${candidate.description} ${(candidate.whyItFits || []).join(' ')}`.toLowerCase();

    // 1. Check for banned generic phrases (Section 24)
    for (const phrase of this.BANNED_GENERIC_PHRASES) {
      if (textToCheck.includes(phrase)) {
        return {
          valid: false,
          reason: `Rejected generic recommendation text containing banned boilerplate: "${phrase}".`,
        };
      }
    }

    // 2. Reject recommendations that do not explain why they fit THIS UI (Section 11)
    if (!candidate.whyItFits || candidate.whyItFits.length === 0) {
      return {
        valid: false,
        reason: 'Recommendation missing "Why it fits" explanation tailored to this specific UI.',
      };
    }

    // 3. Reject unrelated components for the product type (Section 11 & 16)
    if (context.productType === 'marketing') {
      if (
        textToCheck.includes('dense data table') ||
        textToCheck.includes('sortable table') ||
        textToCheck.includes('kpi widget') ||
        textToCheck.includes('primary metrics')
      ) {
        return {
          valid: false,
          reason: 'Do not recommend dashboard data tables or KPI metrics for marketing/service pages.',
        };
      }
    }

    if (context.productType === 'dashboard') {
      if (textToCheck.includes('marketing hero') || textToCheck.includes('sales pitch')) {
        return {
          valid: false,
          reason: 'Do not recommend marketing showcase patterns for operational dashboards.',
        };
      }
    }

    // 4. Reject duplicate / merely renamed solutions (Section 11 & 12)
    for (const existing of existingCandidates) {
      if (existing.transformation === candidate.transformation) {
        return {
          valid: false,
          reason: `Duplicate transformation direction: already has candidate for "${candidate.transformation}".`,
        };
      }
      if (existing.title.toLowerCase() === candidate.title.toLowerCase()) {
        return {
          valid: false,
          reason: `Duplicate recommendation title: "${candidate.title}".`,
        };
      }
    }

    // 5. Must specify tradeoff
    if (!candidate.tradeoff || candidate.tradeoff.trim().length === 0) {
      return {
        valid: false,
        reason: 'Recommendation must explicitly state its design tradeoff.',
      };
    }

    // 6. Must have affected elements
    if (!candidate.affectedElements || candidate.affectedElements.length === 0) {
      return {
        valid: false,
        reason: 'Recommendation must identify affected elements.',
      };
    }

    return { valid: true };
  }
}
