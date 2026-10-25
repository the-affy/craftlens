import {
  Rule,
  RuleOverride,
  RuleExecutionMode,
  SkillPackage,
} from '@craftlens/core';
import { ConflictResolver } from './conflict-resolver.js';

export interface EffectiveRuleGraphNode {
  rule: Rule;
  overriddenBy?: Rule;
  precedence: number;
}

export class RuleResolver {
  private conflictResolver = new ConflictResolver();

  /**
   * Resolves loaded skills and raw rules into an effective, conflict-free rule set
   */
  public resolveEffectiveRules(options: {
    skills: SkillPackage[];
    rawRules: Rule[];
    executionMode: RuleExecutionMode;
    disabledRules: Set<string>;
    overrides?: Record<string, RuleOverride>;
  }): Rule[] {
    const candidateRules: Rule[] = [];

    // 1. Collect candidate rules respecting RuleExecutionMode
    for (const skill of options.skills) {
      if (skill.enabled === false) continue;
      const isBuiltin = skill.source.type === 'builtin';

      if (options.executionMode === 'builtin' && !isBuiltin) continue;
      if (options.executionMode === 'custom' && isBuiltin) continue;

      for (const r of skill.rules) {
        candidateRules.push(r);
      }
    }

    // Add standalone registered rules (if not already included from skills)
    const seenIds = new Set(candidateRules.map(r => r.id));
    for (const r of options.rawRules) {
      if (!seenIds.has(r.id)) {
        if (options.executionMode === 'custom' && (!r.sourceSkillId || r.sourceSkillId === 'craftlens-core')) {
          continue;
        }
        candidateRules.push(r);
        seenIds.add(r.id);
      }
    }

    // 2. Filter out disabled rules and apply overrides
    const activeRules: Rule[] = [];
    for (const rule of candidateRules) {
      if (options.disabledRules.has(rule.id)) {
        continue;
      }

      const override = options.overrides?.[rule.id];
      if (override?.enabled === false) {
        continue;
      }

      let modifiedRule = { ...rule };
      if (override?.severity) {
        modifiedRule.severity = override.severity;
      }

      activeRules.push(modifiedRule);
    }

    // 3. Resolve conflicts by rule ID or conceptual namespace
    const rulesById = new Map<string, Rule>();
    for (const rule of activeRules) {
      const existing = rulesById.get(rule.id);
      if (existing) {
        // Resolve conflict
        const resolved = this.conflictResolver.resolveRuleConflict(existing, rule);
        rulesById.set(rule.id, resolved.effectiveRule);
      } else {
        rulesById.set(rule.id, rule);
      }
    }

    return Array.from(rulesById.values());
  }

  public getConflictResolver(): ConflictResolver {
    return this.conflictResolver;
  }
}
