import {
  RecommendationAlternative,
  RuleRecommendation,
  FixSafety,
} from '@craftlens/core';

export class RecommendationBuilder {
  public static create(options: {
    summary: string;
    rationale: string;
    alternatives?: RecommendationAlternative[];
    fixType?: FixSafety;
    fixDescription?: string;
  }): RuleRecommendation {
    return {
      summary: options.summary,
      rationale: options.rationale,
      alternatives: options.alternatives,
      fix: options.fixType
        ? {
            type: options.fixType,
            description: options.fixDescription || 'Apply recommended structural modification.',
          }
        : undefined,
    };
  }

  /**
   * Format structured recommendation and alternatives into clean markdown for display.
   */
  public static formatMarkdown(rec: RuleRecommendation): string {
    const lines: string[] = [];

    lines.push(`**Suggested direction:**`);
    lines.push(`• ${rec.summary}`);
    if (rec.rationale) {
      lines.push('');
      lines.push(`*Why:* ${rec.rationale}`);
    }

    if (rec.alternatives && rec.alternatives.length > 0) {
      lines.push('');
      lines.push(`**Alternative Approaches:**`);
      for (const alt of rec.alternatives) {
        lines.push(`- **${alt.title}**${alt.implementationDifficulty ? ` \`[${alt.implementationDifficulty}]\`` : ''}`);
        lines.push(`  ${alt.description}`);
        if (alt.whenToUse) {
          lines.push(`  *When to use:* ${alt.whenToUse}`);
        }
        if (alt.tradeoffs && alt.tradeoffs.length > 0) {
          lines.push(`  *Tradeoffs:* ${alt.tradeoffs.join(', ')}`);
        }
      }
    }

    return lines.join('\n');
  }
}
