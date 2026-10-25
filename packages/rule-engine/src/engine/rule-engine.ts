import {
  AnalysisContext,
  Finding,
  PerformanceTracker,
  ProjectContext,
  createDefaultProjectContext,
  isSeverityAtLeast,
  isAuditLevelSufficient,
  computeFindingFingerprint,
  RuleExecutionMode,
  FindingInstance,
  SkillManager,
  UserRuleManager,
  ContextAwareFixGenerator,
  toSemanticSeverity,
} from '@craftlens/core';
import { AstCache, ParsedDocument } from '@craftlens/parser';
import { CraftLensConfig, DEFAULT_CONFIG, SuppressionManager, mergeConfig } from '@craftlens/config';
import { RuleRegistry } from '../registry/rule-registry.js';
import { CraftLensRulesEngine } from './craftlens-rules-engine.js';


export interface AnalyzeOptions {
  filePath: string;
  sourceText: string;
  version?: number;
  config?: CraftLensConfig;
  projectContext?: ProjectContext;
}

export interface AnalyzeResult {
  filePath: string;
  findings: Finding[];
  parseTimeMs: number;
  ruleExecutionTimeMs: number;
  totalTimeMs: number;
  fromCache: boolean;
}

export class RuleEngine {
  private registry: RuleRegistry;
  private astCache: AstCache;
  private performanceTracker: PerformanceTracker;
  private craftLensEngine: CraftLensRulesEngine;
  private userRuleManager: UserRuleManager;

  constructor(
    registry: RuleRegistry,
    astCache?: AstCache,
    performanceTracker?: PerformanceTracker,
    userRuleManager?: UserRuleManager
  ) {
    this.registry = registry;
    this.astCache = astCache || new AstCache();
    this.performanceTracker = performanceTracker || new PerformanceTracker();
    this.userRuleManager = userRuleManager || new UserRuleManager();

    this.craftLensEngine = new CraftLensRulesEngine(this.registry);
    // Initialize independently versioned built-in skills with registered rules
    this.craftLensEngine.getSkillManager().initBuiltinSkills(this.registry.getAllRules());
  }

  public getRegistry(): RuleRegistry {
    return this.registry;
  }

  public getAstCache(): AstCache {
    return this.astCache;
  }

  public getPerformanceTracker(): PerformanceTracker {
    return this.performanceTracker;
  }

  public getCanonicalEngine(): CraftLensRulesEngine {
    return this.craftLensEngine;
  }

  public getSkillManager(): SkillManager {
    return this.craftLensEngine.getSkillManager();
  }

  public getUserRuleManager(): UserRuleManager {
    return this.userRuleManager;
  }

  public setUserRuleManager(mgr: UserRuleManager): void {
    this.userRuleManager = mgr;
  }

  public getRuleStats(): { combined: number; builtin: number; user: number; imported: number; skills: number } {
    const builtin = this.registry.getAllRules().filter(r => this.craftLensEngine.getRuleOverride(r.id)?.enabled !== false).length;
    const userGroups = this.userRuleManager.getAllGroups();
    const user = userGroups.filter(g => g.source !== 'url').flatMap(g => g.rules).filter(r => r.enabled).length;
    const imported = userGroups.filter(g => g.source === 'url').flatMap(g => g.rules).filter(r => r.enabled).length;
    const skills = this.getSkillManager().getRegistry().getAllSkills().reduce((acc, s) => acc + (s.enabled !== false ? s.rules.length : 0), 0);

    const mode = this.getRuleExecutionMode();
    let combined = builtin + user + imported + skills;
    if (mode === 'builtin') combined = builtin;
    else if (mode === 'custom' || mode === 'user') combined = user + imported;

    return { combined, builtin, user, imported, skills };
  }

  public setRuleExecutionMode(mode: RuleExecutionMode): void {
    this.craftLensEngine.setRuleExecutionMode(mode);
  }

  public getRuleExecutionMode(): RuleExecutionMode {
    return this.craftLensEngine.getRuleExecutionMode();
  }


  public analyze(options: AnalyzeOptions): AnalyzeResult {
    const totalStart = performance.now();
    const config = options.config ? mergeConfig(DEFAULT_CONFIG, options.config) : DEFAULT_CONFIG;

    if (!config.enabled) {
      return {
        filePath: options.filePath,
        findings: [],
        parseTimeMs: 0,
        ruleExecutionTimeMs: 0,
        totalTimeMs: 0,
        fromCache: false,
      };
    }

    // 1. Parse AST with cache
    const parseStart = performance.now();
    const { document, fromCache } = this.astCache.getOrParse(
      options.filePath,
      options.sourceText,
      options.version
    );
    const parseTimeMs = performance.now() - parseStart;

    // 2. Prepare Context
    const projectContext = options.projectContext || createDefaultProjectContext();
    const analysisContext: AnalysisContext = {
      filePath: options.filePath,
      sourceCode: options.sourceText,
      parsedAst: document,
      projectContext,
    };

    // 3. Prepare Suppressions
    const suppressionManager = new SuppressionManager(options.sourceText);

    // 4. Execute Rules using canonical CraftLens engine effective rules
    const ruleStart = performance.now();
    const allFindings: Finding[] = [];
    const ruleTimings: Record<string, number> = {};
    const rules = this.craftLensEngine.getRules();
    const effectiveRules = rules.length > 0 ? rules : this.registry.getAllRules();

    const findingsByRuleId = new Map<string, Finding[]>();
    const mode = this.getRuleExecutionMode();
    const shouldRunBuiltin = mode !== 'custom' && mode !== 'user';
    const shouldRunUser = mode === 'combined' || mode === 'custom' || mode === 'user';

    if (shouldRunBuiltin) {
      for (const rule of effectiveRules) {
        const ruleConf = config.rules?.[rule.id];
        if (ruleConf && ruleConf.enabled === false) {
          continue;
        }

        // Check minimum audit level requirement (easy < moderate < hard < strict)
        const minLevel = rule.minAuditLevel || rule.minimumAuditLevel;
        if (minLevel && !isAuditLevelSufficient(config.auditLevel, minLevel)) {
          continue;
        }

        const rStart = performance.now();
        try {
          const findings = rule.detect(analysisContext);
          for (const finding of findings) {
            // Apply configured severity override if present
            if (ruleConf?.severity) {
              finding.severity = ruleConf.severity;
            }

            // Check threshold
            if (!isSeverityAtLeast(finding.severity, config.severity)) {
              continue;
            }

            // Check suppressions
            if (suppressionManager.isSuppressed(finding.ruleId, finding.location.start.line)) {
              continue;
            }

            // Set default findingType and fingerprint if not present
            if (!finding.findingType) {
              finding.findingType = finding.severity === 'suggestion' || finding.severity === 'info' ? 'suggestion' : 'problem';
            }

            // Stamp skill provenance and versions
            finding.sourceSkillId = finding.sourceSkillId || rule.sourceSkillId || 'craftlens-core';
            finding.sourceSkillVersion = finding.sourceSkillVersion || rule.sourceSkillVersion || rule.version || '1.0.0';
            finding.ruleVersion = finding.ruleVersion || rule.version || '1.0.0';

            // Populate Senior Reviewer 4-question guidance from rule if missing on finding
            finding.problemTitle = finding.problemTitle || rule.problemTitle || rule.title;
            finding.whatIsWrong = finding.whatIsWrong || finding.diagnosis || rule.whatIsWrong || rule.diagnosis || finding.message || rule.description;
            finding.whyItMatters = finding.whyItMatters || rule.whyItMatters || rule.rationale || finding.description || rule.description;
            const ruleRecText = typeof rule.recommendation === 'string' ? rule.recommendation : rule.recommendation?.summary;
            finding.howToFix = finding.howToFix || rule.howToFix || ruleRecText || finding.recommendation || 'Fix the issue directly.';
            finding.suggestedSteps = finding.suggestedSteps || rule.suggestedSteps || rule.structuredRecommendation?.steps;
            finding.structuredRecommendation = finding.structuredRecommendation || rule.structuredRecommendation;
            finding.supportedActions = finding.supportedActions || rule.supportedActions;

            if (!finding.fingerprint) {
              finding.fingerprint = computeFindingFingerprint(finding);
            }

            if (!findingsByRuleId.has(rule.id)) {
              findingsByRuleId.set(rule.id, []);
            }
            findingsByRuleId.get(rule.id)!.push(finding);
          }
        } catch (err) {
          // Rules must not crash the entire engine
          console.error(`Rule ${rule.id} failed during execution:`, err);
        }
        ruleTimings[rule.id] = performance.now() - rStart;
      }
    }

    // Execute User Custom Rules (Section 6 & 8)
    if (shouldRunUser) {
      try {
        const userFindings = this.userRuleManager.evaluateRulesForFile(options.filePath, options.sourceText);
        for (const uf of userFindings) {
          if (!suppressionManager.isSuppressed(uf.ruleId, uf.location.start.line)) {
            if (!findingsByRuleId.has(uf.ruleId)) {
              findingsByRuleId.set(uf.ruleId, []);
            }
            findingsByRuleId.get(uf.ruleId)!.push(uf);
          }
        }
      } catch (err) {
        console.error('Error executing user rules:', err);
      }
    }

    // Aggregate multiple instances per finding (Requirements 64 & 66)
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

      for (const item of list) {
        item.instances = instances;
        allFindings.push(item);
      }
    }

    // Enrich every finding with Section 17 model, semantic severity, and Section 2 & 3 dynamic suggestions
    for (const f of allFindings) {
      f.filePath = f.filePath || options.filePath;
      f.startLine = f.startLine ?? f.location?.start?.line ?? 1;
      f.endLine = f.endLine ?? f.location?.end?.line ?? f.startLine;
      f.source = f.source || { type: 'builtin', name: 'CraftLens' };
      f.problemTitle = f.problemTitle || f.title || f.ruleId;
      f.whatIsWrong = f.whatIsWrong || f.message || f.problemTitle;
      f.whyItMatters = f.whyItMatters || f.description || f.whatIsWrong;
      f.semanticSeverity = toSemanticSeverity(f.severity);
      f.suggestions = ContextAwareFixGenerator.generateSuggestions(f, projectContext, options.sourceText);
      f.autoFixAvailable = f.suggestions.some(s => s.type === 'autofix' && s.safe);
    }


    const ruleExecutionTimeMs = performance.now() - ruleStart;
    const totalTimeMs = performance.now() - totalStart;

    // 5. Cap findings
    // Prioritize high-level architectural & design problems over low-level token repetitions (Requirement 29)
    const isHighLevel = (ruleId: string) =>
      ruleId === 'CP-007' ||
      ruleId === 'UI-015' ||
      ruleId === 'UI-016' ||
      ruleId === 'UI-013' ||
      ruleId === 'UI-014' ||
      ruleId === 'VH-008' ||
      ruleId === 'CP-002' ||
      ruleId === 'UI-017' ||
      ruleId === 'UI-019' ||
      ruleId === 'UI-020';

    allFindings.sort((a, b) => {
      const aHigh = isHighLevel(a.ruleId) ? 1 : 0;
      const bHigh = isHighLevel(b.ruleId) ? 1 : 0;
      if (aHigh !== bHigh) return bHigh - aHigh;

      const sevWeight = (s: string) =>
        s === 'blocker' ? 5 : s === 'error' ? 4 : s === 'warning' ? 3 : s === 'suggestion' ? 2 : 1;
      const sevDiff = sevWeight(b.severity) - sevWeight(a.severity);
      if (sevDiff !== 0) return sevDiff;

      return (b.confidence || 0) - (a.confidence || 0);
    });

    // Deduplicate / cap repetitive micro-findings so low-level token rules do not crowd out reports
    const ruleCountMap = new Map<string, number>();
    const filteredFindings: Finding[] = [];
    for (const f of allFindings) {
      const count = ruleCountMap.get(f.ruleId) || 0;
      if (!isHighLevel(f.ruleId) && count >= 3) {
        continue;
      }
      ruleCountMap.set(f.ruleId, count + 1);
      filteredFindings.push(f);
    }

    const cappedFindings = filteredFindings.slice(0, config.maxDiagnosticsPerFile);

    // 6. Record Performance Metric
    this.performanceTracker.recordMetric({
      filePath: options.filePath,
      parseTimeMs,
      ruleExecutionTimeMs,
      totalDiagnosticTimeMs: totalTimeMs,
      cacheHit: fromCache,
      ruleTimings,
      timestamp: Date.now(),
    });

    return {
      filePath: options.filePath,
      findings: cappedFindings,
      parseTimeMs,
      ruleExecutionTimeMs,
      totalTimeMs,
      fromCache,
    };
  }
}
