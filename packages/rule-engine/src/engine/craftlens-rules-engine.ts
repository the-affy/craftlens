import {
  AnalysisContext,
  Finding,
  Rule,
  SkillPackage,
  RulesEngineContract,
  RuleExplanation,
  RuleProvider,
  SkillProvider,
  ResearchProvider,
  FixProvider,
  RuleOverride,
  RuleExecutionMode,
  FindingInstance,
  computeFindingFingerprint,
  isAuditLevelSufficient,
  AuditLevel,
} from '@craftlens/core';
import { RuleRegistry } from '../registry/rule-registry.js';
import { RuleResolver } from './rule-resolver.js';
import { SkillManager } from '@craftlens/core';

export class CraftLensRulesEngine implements RulesEngineContract {
  public static readonly ENGINE_VERSION = '1.0.0';

  private ruleRegistry: RuleRegistry;
  private skillManager: SkillManager;
  private ruleResolver: RuleResolver;
  private disabledRules = new Set<string>();
  private ruleOverrides = new Map<string, RuleOverride>();

  private ruleProviders: RuleProvider[] = [];
  private skillProviders: SkillProvider[] = [];
  private researchProviders: ResearchProvider[] = [];
  private fixProviders: FixProvider[] = [];

  constructor(
    ruleRegistry?: RuleRegistry,
    skillManager?: SkillManager,
    ruleResolver?: RuleResolver
  ) {
    this.ruleRegistry = ruleRegistry || new RuleRegistry();
    this.skillManager = skillManager || new SkillManager();
    this.ruleResolver = ruleResolver || new RuleResolver();
  }

  public getRuleRegistry(): RuleRegistry {
    return this.ruleRegistry;
  }

  public getSkillManager(): SkillManager {
    return this.skillManager;
  }

  public getRuleResolver(): RuleResolver {
    return this.ruleResolver;
  }

  // Provider registration (Section 37)
  public addRuleProvider(provider: RuleProvider): void {
    this.ruleProviders.push(provider);
  }

  public addSkillProvider(provider: SkillProvider): void {
    this.skillProviders.push(provider);
  }

  public addResearchProvider(provider: ResearchProvider): void {
    this.researchProviders.push(provider);
  }

  public addFixProvider(provider: FixProvider): void {
    this.fixProviders.push(provider);
  }

  // SkillsEngineContract methods
  public async loadSkill(skill: SkillPackage): Promise<void> {
    const regResult = this.skillManager.getRegistry().register(skill);
    if (!regResult.success) {
      throw new Error(regResult.warnings.join('; '));
    }
  }

  public async unloadSkill(skillId: string): Promise<void> {
    this.skillManager.getRegistry().removeSkill(skillId);
  }

  public async enableRule(ruleId: string): Promise<void> {
    this.disabledRules.delete(ruleId);
    const existing = this.ruleOverrides.get(ruleId);
    if (existing) {
      existing.enabled = true;
    }
  }

  public async disableRule(ruleId: string): Promise<void> {
    this.disabledRules.add(ruleId);
    const existing = this.ruleOverrides.get(ruleId) || { ruleId };
    existing.enabled = false;
    this.ruleOverrides.set(ruleId, existing);
  }

  public setRuleOverride(override: RuleOverride): void {
    this.ruleOverrides.set(override.ruleId, override);
    if (override.enabled === false) {
      this.disabledRules.add(override.ruleId);
    } else if (override.enabled === true) {
      this.disabledRules.delete(override.ruleId);
    }
  }

  public getRuleOverride(ruleId: string): RuleOverride | undefined {
    return this.ruleOverrides.get(ruleId);
  }

  public setRuleExecutionMode(mode: RuleExecutionMode): void {
    this.skillManager.setRuleExecutionMode(mode);
  }

  public getRuleExecutionMode(): RuleExecutionMode {
    return this.skillManager.getRuleExecutionMode();
  }

  public getSkills(): SkillPackage[] {
    const registered = this.skillManager.getRegistry().getAllSkills();
    const providerSkills = this.skillProviders.flatMap(p => p.getSkills());
    return [...registered, ...providerSkills];
  }

  public getRules(): Rule[] {
    const skills = this.getSkills();
    const rawRules = [
      ...this.ruleRegistry.getAllRules(),
      ...this.ruleProviders.flatMap(p => p.getRules()),
    ];

    const overridesObj: Record<string, RuleOverride> = {};
    for (const [k, v] of this.ruleOverrides.entries()) {
      overridesObj[k] = v;
    }

    return this.ruleResolver.resolveEffectiveRules({
      skills,
      rawRules,
      executionMode: this.getRuleExecutionMode(),
      disabledRules: this.disabledRules,
      overrides: overridesObj,
    });
  }

  public async explain(ruleId: string): Promise<RuleExplanation> {
    const rule = this.getRules().find(r => r.id === ruleId) || this.ruleRegistry.getRule(ruleId);
    if (!rule) {
      throw new Error(`Rule '${ruleId}' not found in engine.`);
    }

    const rec =
      typeof rule.recommendation === 'object'
        ? rule.recommendation.summary
        : rule.structuredRecommendation?.summary || (rule.recommendation as string) || rule.description;

    return {
      rule,
      whyItMatters: rule.whyItMatters || rule.rationale || rule.description,
      detects: rule.whatIsWrong || rule.diagnosis || rule.description,
      doesNotDetect: rule.falsePositiveGuards?.join(', ') || 'Cases explicitly justified by user design context.',
      falsePositives: rule.falsePositiveConditions || rule.falsePositiveGuards || [],
      recommendation: rec,
      fixType: rule.fixStrategy?.type || rule.fix || 'assisted',
      examples: rule.examples,
    };
  }

  public async analyze(context: AnalysisContext, auditLevel: AuditLevel = 'moderate'): Promise<Finding[]> {
    const rules = this.getRules();
    const allFindings: Finding[] = [];

    // Group findings by rule ID to aggregate multiple instances (Section 64)
    const findingsByRuleId = new Map<string, Finding[]>();

    for (const rule of rules) {
      if (this.disabledRules.has(rule.id)) {
        continue;
      }

      if (rule.minAuditLevel && !isAuditLevelSufficient(auditLevel, rule.minAuditLevel)) {
        continue;
      }
      if (rule.minimumAuditLevel && !isAuditLevelSufficient(auditLevel, rule.minimumAuditLevel)) {
        continue;
      }

      try {
        const findings = rule.detect(context);
        for (const f of findings) {
          // Stamp skill provenance and versions
          f.sourceSkillId = f.sourceSkillId || rule.sourceSkillId || 'craftlens-core';
          f.sourceSkillVersion = f.sourceSkillVersion || rule.sourceSkillVersion || rule.version || '1.0.0';
          f.ruleVersion = f.ruleVersion || rule.version || '1.0.0';

          // Apply severity overrides if present
          const ov = this.ruleOverrides.get(rule.id);
          if (ov?.severity) {
            f.severity = ov.severity;
          }

          if (!f.fingerprint) {
            f.fingerprint = computeFindingFingerprint(f);
          }

          if (!findingsByRuleId.has(rule.id)) {
            findingsByRuleId.set(rule.id, []);
          }
          findingsByRuleId.get(rule.id)!.push(f);
        }
      } catch (err) {
        console.error(`Error executing rule ${rule.id}:`, err);
      }
    }

    // Process multiple instances and link them to each finding
    for (const [ruleId, list] of findingsByRuleId.entries()) {
      if (list.length === 0) continue;

      const instances: FindingInstance[] = list.map((item, idx) => ({
        id: `${ruleId}_inst_${idx + 1}`,
        findingId: item.fingerprint,
        ruleId,
        location: item.location,
        snippet: item.evidence?.[0]?.snippet,
        evidence: item.evidence || [],
        fix: item.fix,
        status: 'active',
      }));

      // Enrich primary finding with full instances collection
      for (const item of list) {
        item.instances = instances;
        allFindings.push(item);
      }
    }

    return allFindings;
  }
}
