import {
  Rule,
  RuleRecommendation,
  FixStrategy,
  Finding,
  FixSafety,
  SkillPackage,
} from '@craftlens/core';

export interface ConflictResolutionResult {
  effectiveRule: Rule;
  mergedRecommendation?: RuleRecommendation;
  mergedFixStrategy?: FixStrategy;
  conflictDetected: boolean;
  conflictRationale?: string;
}

export class ConflictResolver {
  /**
   * Calculates precedence score for a rule:
   * 1. Project-specific user rule (100)
   * 2. Project skill (80)
   * 3. User skill (60)
   * 4. CraftLens built-in rule (40)
   * 5. External reference guidance (20)
   */
  public getRulePrecedence(rule: Rule): number {
    const id = rule.id.toLowerCase();
    const sourceSkillId = (rule.sourceSkillId || '').toLowerCase();

    if (id.startsWith('project.') || sourceSkillId.includes('project')) {
      return 100;
    }
    if (sourceSkillId.includes('company') || sourceSkillId.includes('team')) {
      return 80;
    }
    if (id.startsWith('user.') || sourceSkillId.includes('user') || !rule.sourceSkillId) {
      return 60;
    }
    if (
      sourceSkillId.startsWith('craftlens') ||
      sourceSkillId === 'anti-ai-ui' ||
      sourceSkillId === 'accessibility' ||
      sourceSkillId === 'security' ||
      sourceSkillId === 'performance' ||
      sourceSkillId === 'frontend-engineering' ||
      sourceSkillId === 'component-reference' ||
      sourceSkillId === 'ui-ux-pro-max'
    ) {
      return 40;
    }
    return 20;
  }

  /**
   * Resolves conflicts between two competing rules addressing the same concept
   */
  public resolveRuleConflict(ruleA: Rule, ruleB: Rule): ConflictResolutionResult {
    const scoreA = this.getRulePrecedence(ruleA);
    const scoreB = this.getRulePrecedence(ruleB);

    const winner = scoreA >= scoreB ? ruleA : ruleB;
    const loser = scoreA >= scoreB ? ruleB : ruleA;

    // Merge recommendations without blindingly duplicating or contradicting
    const mergedRecommendation = this.mergeRecommendations(winner, loser);
    const mergedFixStrategy = this.mergeFixStrategies(winner, loser);

    return {
      effectiveRule: winner,
      mergedRecommendation,
      mergedFixStrategy,
      conflictDetected: true,
      conflictRationale: `Resolved rule conflict between '${ruleA.id}' (score ${scoreA}) and '${ruleB.id}' (score ${scoreB}). Higher precedence rule '${winner.id}' applies.`,
    };
  }

  /**
   * Merges recommendations from high-priority rule and baseline rule
   */
  public mergeRecommendations(primary: Rule, secondary?: Rule): RuleRecommendation {
    const primRec =
      typeof primary.recommendation === 'object'
        ? primary.recommendation
        : primary.structuredRecommendation || {
            summary: (primary.recommendation as string) || primary.description,
            why: primary.whyItMatters || primary.rationale || primary.description,
            howToFix: primary.howToFix || primary.recommendation || primary.description,
          };

    if (!secondary) {
      return primRec;
    }

    const secRec =
      typeof secondary.recommendation === 'object'
        ? secondary.recommendation
        : secondary.structuredRecommendation;

    const mergedSummary = `${primRec.summary}${
      secRec ? ` (Harmonized with ${secondary.sourceSkillId || secondary.id})` : ''
    }`;

    return {
      summary: mergedSummary,
      why: primRec.why || secRec?.why,
      howToFix: primRec.howToFix || secRec?.howToFix,
      steps: primRec.steps || secRec?.steps,
      alternatives: [...(primRec.alternatives || []), ...(secRec?.alternatives || [])],
    };
  }

  /**
   * Merges fix strategies safely (Section 62: If conflicting safe edits, switch to assisted/manual)
   */
  public mergeFixStrategies(primary: Rule, secondary?: Rule): FixStrategy | undefined {
    if (!primary.fixStrategy && !primary.fix) {
      return secondary?.fixStrategy;
    }

    const primaryStrategy: FixStrategy = primary.fixStrategy || {
      id: `fix_${primary.id}`,
      title: `Apply ${primary.name || primary.id} fix`,
      description: primary.howToFix || primary.description,
      type: (primary.fix === 'safe' ? 'safe' : primary.fix === 'assisted' ? 'assisted' : 'manual') as FixSafety,
    };

    if (!secondary || (!secondary.fixStrategy && !secondary.fix)) {
      return primaryStrategy;
    }

    // Check for conflicting safe replacement
    if (primary.fix === 'safe' && secondary.fix === 'safe') {
      const pRep = primary.fixStrategy?.replacement;
      const sRep = secondary.fixStrategy?.replacement;
      if (pRep && sRep && pRep !== sRep) {
        // Conflicting replacements: demote to assisted to avoid corrupting user source
        return {
          ...primaryStrategy,
          type: 'assisted',
          description: `${primaryStrategy.description} (Manual review advised due to differing skill fix strategies).`,
        };
      }
    }

    return primaryStrategy;
  }

  /**
   * Detects material conflicts between active skills and explains contextual resolution (Section 26 & 27)
   */
  public detectSkillConflicts(
    activeSkills: SkillPackage[],
    projectContext?: any
  ): { detected: boolean; message: string; details: string[] } {
    const details: string[] = [];

    let compactPreferred: string | null = null;
    let generousWhitespacePreferred: string | null = null;

    for (const skill of activeSkills) {
      if (skill.enabled === false) continue;
      const skillName = skill.manifest.displayName || skill.manifest.name;
      for (const g of skill.guidance || []) {
        const text = `${g.title} ${g.content}`.toLowerCase();
        if (text.includes('compact') || text.includes('increase density') || text.includes('high density')) {
          compactPreferred = skillName;
        }
        if (text.includes('generous whitespace') || text.includes('loose spacing') || text.includes('room to breathe')) {
          generousWhitespacePreferred = skillName;
        }
      }
    }

    if (compactPreferred && generousWhitespacePreferred && compactPreferred !== generousWhitespacePreferred) {
      const isMarketing =
        projectContext?.productMeta?.productType === 'marketing' ||
        projectContext?.productMeta?.productType === 'brand';
      const winner = isMarketing
        ? `${generousWhitespacePreferred} → preserve existing system`
        : `${compactPreferred} → increase density`;
      const contextDesc = isMarketing ? 'a marketing site' : 'an interactive application';
      const msg = `Skill conflict detected: Two active skills recommend different spacing strategies. ${generousWhitespacePreferred} → generous spacing; ${compactPreferred} → compact density. Existing project is ${contextDesc}. ${winner} selected according to project context.`;
      details.push(msg);
      return { detected: true, message: msg, details };
    }

    return { detected: false, message: '', details: [] };
  }
}

