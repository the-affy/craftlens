import { DesignContext } from '../context/design-context.js';
import { DesignProblem } from '../problem-model/problem-model.js';
import { DesignRecommendationCandidate } from '../transformations/types.js';

export class RecommendationRanker {
  public static rank(
    candidates: DesignRecommendationCandidate[],
    context: DesignContext,
    problem: DesignProblem
  ): DesignRecommendationCandidate[] {
    const scored = candidates.map(c => ({
      candidate: c,
      score: this.score(c, context, problem),
    }));

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // Pick top 2-3 genuinely different directions (Section 12)
    const result: DesignRecommendationCandidate[] = [];
    const usedTransformations = new Set<string>();

    for (const item of scored) {
      if (!usedTransformations.has(item.candidate.transformation)) {
        usedTransformations.add(item.candidate.transformation);
        result.push(item.candidate);
        if (result.length >= 3) break;
      }
    }

    return result;
  }

  private static score(
    candidate: DesignRecommendationCandidate,
    context: DesignContext,
    problem: DesignProblem
  ): number {
    let score = (candidate.confidence || 0.85) * 100;

    // 0. Relevance to detected problem category (Section 21)
    if (problem.category === 'visual-repetition') {
      if (
        candidate.transformation === 'hierarchize' ||
        candidate.transformation === 'distill' ||
        candidate.transformation === 'differentiate'
      ) {
        score += 30;
      }
    } else if (problem.category === 'color') {
      if (candidate.transformation === 'colorize' || candidate.transformation === 'quieter') {
        score += 30;
      }
    } else if (problem.category === 'typography') {
      if (candidate.transformation === 'typeset' || candidate.transformation === 'hierarchize') {
        score += 30;
      }
    } else if (problem.category === 'interaction') {
      if (candidate.transformation === 'improve-interaction') {
        score += 30;
      }
    }

    // 1. Minimal change bias (Section 22)
    // local > component > section > page > system
    switch (candidate.scope) {
      case 'local':
        score += 20;
        break;
      case 'component':
        score += 15;
        break;
      case 'section':
        score += 10;
        break;
      case 'page':
        score += 3;
        break;
      case 'system':
        score += 0;
        break;
    }

    // 2. Evidence strength
    const evidenceCount = Math.min((candidate.evidence || []).length, 5);
    score += evidenceCount * 3;

    // 3. Product fit
    if (context.productType === 'marketing' && candidate.scope !== 'system') {
      score += 10;
    } else if (context.productType === 'dashboard') {
      score += 8;
    }

    // 4. Implementation feasibility
    if (candidate.implementationApproach) {
      score += 5;
    }

    // 5. Penalties for unnecessary complexity
    if (candidate.scope === 'system' && problem.category === 'visual-repetition') {
      score -= 15;
    }

    return score;
  }
}
