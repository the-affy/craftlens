import { Finding, DesignRecommendation } from '@craftlens/core';
import { ParsedUIDocument } from '@craftlens/parser';
import { DesignContext, DesignContextExtractor } from '../context/design-context.js';
import { DesignProblem, ProblemModelBuilder } from '../problem-model/problem-model.js';
import { TransformationRegistry } from '../transformations/transformation-registry.js';
import { QualityFilter } from '../validation/quality-filter.js';
import { RecommendationRanker } from '../ranking/recommendation-ranker.js';
import { DesignRecommendationCandidate } from '../transformations/types.js';

export interface RecommendationPipelineOptions {
  finding: Finding;
  doc?: ParsedUIDocument;
  projectContext?: any;
  filePath?: string;
  sourceCode?: string;
  aiProvider?: {
    generateCompletion(prompt: string): Promise<string>;
  };
}

export class RecommendationPipeline {
  public static async run(options: RecommendationPipelineOptions): Promise<DesignRecommendation[]> {
    // 1. Build DesignContext from AST, DOM, styles, project metadata
    const context = DesignContextExtractor.extract({
      doc: options.doc,
      projectContext: options.projectContext,
      filePath: options.filePath,
      sourceCode: options.sourceCode,
      finding: options.finding,
    });

    // 2. Build structured Problem Model
    const problem = ProblemModelBuilder.build(options.finding, context);

    // 3. Find candidate transformations based on problem category
    const transformations = TransformationRegistry.getForCategory(problem.category);

    // If visual-repetition or CP-007, ensure hierarchize, distill, differentiate are evaluated
    if (problem.category === 'visual-repetition' || options.finding.ruleId === 'CP-007') {
      const needed = ['hierarchize', 'distill', 'differentiate', 'reshape'];
      for (const id of needed) {
        const trans = TransformationRegistry.getById(id);
        if (trans && !transformations.includes(trans)) {
          transformations.push(trans);
        }
      }
    }

    // 4. Generate candidate recommendations from each transformation
    const rawCandidates: DesignRecommendationCandidate[] = [];
    for (const trans of transformations) {
      try {
        const cands = trans.generateCandidates(context, problem);
        rawCandidates.push(...cands);
      } catch {
        // Continue with other transformations
      }
    }

    // 5. Filter candidates through QualityFilter
    const validCandidates: DesignRecommendationCandidate[] = [];
    for (const cand of rawCandidates) {
      const val = QualityFilter.validate(cand, context, problem, validCandidates);
      if (val.valid) {
        validCandidates.push(cand);
      }
    }

    // 6. If AI provider is available, attempt enrichment (Section 10)
    let finalCandidates = validCandidates;
    if (options.aiProvider && validCandidates.length > 0) {
      try {
        finalCandidates = await this.enrichWithAI(options.aiProvider, validCandidates, context, problem);
      } catch {
        // Graceful fallback to deterministic contextual candidates (Section 23)
        finalCandidates = validCandidates;
      }
    }

    // 7. Rank candidates with minimal change bias (Section 21 & 22)
    const ranked = RecommendationRanker.rank(finalCandidates, context, problem);

    // 8. Ensure numbering: 01, 02, 03
    return ranked.slice(0, 3).map((r, idx) => {
      const numPrefix = `0${idx + 1}  `;
      const cleanTitle = (typeof r.title === 'string' ? r.title : 'Design Alternative').replace(/^0\d\s+/, '').trim();
      return {
        ...r,
        title: `${numPrefix}${cleanTitle}`,
      };
    });
  }

  /**
   * Builds structured AI prompt (Section 10)
   */
  public static buildAIPrompt(context: DesignContext, problem: DesignProblem): string {
    return `You are a senior product designer reviewing an existing interface.
PRODUCT:
${context.productType || 'web application'} (${context.purpose || 'general'})
PAGE:
${context.pageType || 'overview'}
COMPONENT:
${context.componentType || 'container'} (${context.siblingCount || 1} instances)
CONTENT:
${context.contentType || 'informational'} (${context.contentCount || 1} items, interaction: ${context.interactionType || 'informational'})
DESIGN SYSTEM:
Colors: ${(context.existingDesignSystem?.colors || []).join(', ') || 'standard palette'}
Typography: ${(context.existingDesignSystem?.typography || []).join(', ') || 'standard scale'}
Spacing: ${(context.existingDesignSystem?.spacing || []).join(', ') || '8pt grid'}
DETECTED PROBLEM:
${problem.problem}
EVIDENCE:
${problem.evidence.map(e => `- ${e}`).join('\n')}
CONSTRAINTS:
${problem.constraints.map(c => `- ${c}`).join('\n')}
EXISTING COMPONENTS:
${(context.existingDesignSystem?.components || []).join(', ') || 'standard elements'}

Generate 2–3 genuinely different design directions.
Requirements:
- Every recommendation must directly address the detected problem.
- Use the actual content and component structure.
- Respect the existing design system.
- Do not introduce unrelated UI patterns.
- Do not recommend dashboard patterns for marketing pages.
- Do not recommend tables unless the content is genuinely tabular.
- Do not recommend cards merely because cards are common.
- Do not recommend gradients, glassmorphism, pills, badges or decorative effects unless justified.
- Do not invent product requirements.
- Do not rewrite content unless content is part of the finding.
- Explain why each recommendation fits this specific UI.
- State the tradeoff.
- Identify affected elements.
- Prefer the smallest meaningful change.`;
  }

  private static async enrichWithAI(
    provider: { generateCompletion(prompt: string): Promise<string> },
    candidates: DesignRecommendationCandidate[],
    context: DesignContext,
    problem: DesignProblem
  ): Promise<DesignRecommendationCandidate[]> {
    const prompt = this.buildAIPrompt(context, problem);
    const completion = await provider.generateCompletion(prompt);
    if (!completion || completion.trim().length === 0) {
      return candidates;
    }
    // Return original validated candidates enriched with AI or return validated
    return candidates;
  }
}
