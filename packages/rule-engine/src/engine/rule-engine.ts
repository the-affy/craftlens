import {
  AnalysisContext,
  Finding,
  PerformanceTracker,
  ProjectContext,
  createDefaultProjectContext,
  isSeverityAtLeast,
  isAuditLevelSufficient,
  computeFindingFingerprint,
} from '@anti-slop/core';
import { AstCache, ParsedDocument } from '@anti-slop/parser';
import { AntiSlopConfig, DEFAULT_CONFIG, SuppressionManager } from '@anti-slop/config';
import { RuleRegistry } from '../registry/rule-registry.js';

export interface AnalyzeOptions {
  filePath: string;
  sourceText: string;
  version?: number;
  config?: AntiSlopConfig;
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

  constructor(
    registry: RuleRegistry,
    astCache?: AstCache,
    performanceTracker?: PerformanceTracker
  ) {
    this.registry = registry;
    this.astCache = astCache || new AstCache();
    this.performanceTracker = performanceTracker || new PerformanceTracker();
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

  public analyze(options: AnalyzeOptions): AnalyzeResult {
    const totalStart = performance.now();
    const config = options.config || DEFAULT_CONFIG;

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

    // 4. Execute Rules
    const ruleStart = performance.now();
    const allFindings: Finding[] = [];
    const ruleTimings: Record<string, number> = {};
    const rules = this.registry.getAllRules();

    for (const rule of rules) {
      const ruleConf = config.rules[rule.id];
      if (ruleConf && ruleConf.enabled === false) {
        continue;
      }

      // Check minimum audit level requirement (easy < moderate < hard < strict)
      if (rule.minimumAuditLevel && !isAuditLevelSufficient(config.auditLevel, rule.minimumAuditLevel)) {
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
          if (!finding.fingerprint) {
            finding.fingerprint = computeFindingFingerprint(finding);
          }

          allFindings.push(finding);
        }
      } catch (err) {
        // Rules must not crash the entire engine
        console.error(`Rule ${rule.id} failed during execution:`, err);
      }
      ruleTimings[rule.id] = performance.now() - rStart;
    }

    const ruleExecutionTimeMs = performance.now() - ruleStart;
    const totalTimeMs = performance.now() - totalStart;

    // 5. Cap findings
    const cappedFindings = allFindings.slice(0, config.maxDiagnosticsPerFile);

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
