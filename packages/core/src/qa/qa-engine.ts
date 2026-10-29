import {
  QAAnalyzer,
  QAContext,
  QAMode,
  QAReport,
  QAResult,
  QACheckSummary,
  QARawFinding,
  CorrelatedFinding,
} from './types.js';
import { EvidenceNormalizer } from './evidence/normalizer.js';
import { MultiPassReviewEngine } from './review/multi-pass-reviewer.js';
import { FindingCorrelator } from './correlation/correlator.js';
import { ReleaseGate } from './gate/release-gate.js';
import { ESLintAdapter, SemgrepAdapter, CodeQLAdapter } from './adapters/external-adapter.js';

import { TypeScriptAnalyzer } from './analyzers/typescript-analyzer.js';
import { ExtensionManifestAnalyzer } from './analyzers/extension-manifest-analyzer.js';
import { CommandRegistryAnalyzer } from './analyzers/command-registry-analyzer.js';
import { RuntimeSafetyAnalyzer } from './analyzers/runtime-safety-analyzer.js';
import { WebviewAnalyzer } from './analyzers/webview-analyzer.js';
import { StateConsistencyAnalyzer } from './analyzers/state-consistency-analyzer.js';
import { FixEngineAnalyzer } from './analyzers/fix-engine-analyzer.js';
import { DependencyAnalyzer } from './analyzers/dependency-analyzer.js';
import { SecurityAnalyzer } from './analyzers/security-analyzer.js';
import { CodeQualityAnalyzer } from './analyzers/code-quality-analyzer.js';
import { TestAnalyzer } from './analyzers/test-analyzer.js';
import { PackagingAnalyzer } from './analyzers/packaging-analyzer.js';
import { CraftLensArchitectureAnalyzer } from './analyzers/architecture-analyzer.js';
import { IssueRegistry } from '../issue-registry/issue-registry.js';

export class CraftLensQAEngine {
  private builtInAnalyzers: QAAnalyzer[] = [];
  private externalAdapters: QAAnalyzer[] = [];
  private normalizer = new EvidenceNormalizer();
  private reviewer = new MultiPassReviewEngine();
  private correlator = new FindingCorrelator();
  private gate = new ReleaseGate();

  constructor(issueRegistry?: IssueRegistry) {
    if (issueRegistry) {
      this.correlator.setIssueRegistry(issueRegistry);
    }
    this.registerDefaultAnalyzers();
  }

  public setIssueRegistry(registry: IssueRegistry): void {
    this.correlator.setIssueRegistry(registry);
  }

  private registerDefaultAnalyzers(): void {
    // 13 Built-in Analyzers
    this.builtInAnalyzers = [
      new TypeScriptAnalyzer(),
      new ExtensionManifestAnalyzer(),
      new CommandRegistryAnalyzer(),
      new RuntimeSafetyAnalyzer(),
      new WebviewAnalyzer(),
      new StateConsistencyAnalyzer(),
      new FixEngineAnalyzer(),
      new DependencyAnalyzer(),
      new SecurityAnalyzer(),
      new CodeQualityAnalyzer(),
      new TestAnalyzer(),
      new PackagingAnalyzer(),
      new CraftLensArchitectureAnalyzer(),
    ];

    // Optional External Adapters
    this.externalAdapters = [
      new ESLintAdapter(),
      new SemgrepAdapter(),
      new CodeQLAdapter(),
    ];
  }

  /**
   * Main entry point to run QA analysis across chosen mode.
   */
  public async runQA(context: QAContext, signal?: AbortSignal): Promise<QAReport> {
    const start = Date.now();
    const analyzersToRun = this.selectAnalyzersForMode(context.mode);

    const analyzerResults: QAResult[] = [];
    const rawFindings: QARawFinding[] = [];

    // Execute each analyzer safely
    for (const analyzer of analyzersToRun) {
      if (signal?.aborted) break;

      try {
        const available = await analyzer.isAvailable(context);
        if (!available) {
          analyzerResults.push({
            analyzerId: analyzer.id,
            analyzerName: analyzer.name,
            category: analyzer.category,
            status: 'not_available',
            durationMs: 0,
            findings: [],
            notes: `Optional analyzer not available in environment.`,
          });
          continue;
        }

        const res = await analyzer.analyze(context, signal);
        analyzerResults.push(res);
        if (Array.isArray(res.findings)) {
          rawFindings.push(...res.findings);
        }
      } catch (err: any) {
        analyzerResults.push({
          analyzerId: analyzer.id,
          analyzerName: analyzer.name,
          category: analyzer.category,
          status: 'fail',
          durationMs: 0,
          findings: [],
          notes: `Execution exception: ${err.message || 'unknown error'}`,
        });
      }
    }

    // 1. Evidence Normalization
    let unconfirmedDiscarded = 0;
    const normalizedFindings: QARawFinding[] = [];

    for (const raw of rawFindings) {
      const normRes = this.normalizer.normalize(raw, context.workspaceRoot);
      if (normRes.accepted && normRes.finding) {
        normalizedFindings.push(normRes.finding);
      } else {
        unconfirmedDiscarded++;
      }
    }

    // 2. Multi-Pass Review (Correctness, Adversarial, Architecture)
    const reviewedInputs: { finding: QARawFinding; reviewResult: any }[] = [];
    for (const f of normalizedFindings) {
      const revRes = this.reviewer.reviewFinding(f, context.workspaceRoot);
      if (revRes.accepted) {
        reviewedInputs.push({
          finding: { ...f, confidence: revRes.finalConfidence },
          reviewResult: revRes,
        });
      } else {
        unconfirmedDiscarded++;
      }
    }

    // 3. Finding Correlation & Issue Registry Sync
    const { correlated, canonicalIssues } = this.correlator.correlate(reviewedInputs);

    // 4. Release Gate Evaluation
    const gateEval = this.gate.evaluate(analyzerResults, correlated);

    // 5. Generate Check Summaries
    const checks: QACheckSummary[] = analyzerResults.map(r => ({
      id: r.analyzerId,
      name: r.analyzerName,
      category: r.category,
      status: r.status,
      durationMs: r.durationMs,
      notes: r.notes || r.skipReason,
      findingsCount: r.findings?.length || 0,
    }));

    // 6. Summary Metrics
    const summary = {
      critical: correlated.filter(c => c.severity === 'critical').length,
      high: correlated.filter(c => c.severity === 'high').length,
      medium: correlated.filter(c => c.severity === 'medium').length,
      low: correlated.filter(c => c.severity === 'low').length,
      suggestions: correlated.filter(c => c.severity === 'suggestion').length,
      total: correlated.length,
      unconfirmedDiscarded,
    };

    return {
      id: `qa-report-${Date.now()}`,
      timestamp: Date.now(),
      mode: context.mode,
      durationMs: Date.now() - start,
      gateResult: gateEval.verdict,
      gateReasons: gateEval.reasons,
      summary,
      checks,
      analyzerResults,
      correlatedFindings: correlated,
      canonicalIssues,
    };
  }

  /**
   * Runs Deep Self-QA of CraftLens itself.
   */
  public async runSelfQA(workspaceRoot: string, signal?: AbortSignal): Promise<QAReport> {
    const context: QAContext = {
      workspaceRoot,
      projectContext: {
        workspaceRoot,
        projectName: 'craftlens',
        hasTsConfig: true,
        isMonorepo: true,
        detectedFrameworks: ['vscode'],
      } as any,
      mode: 'self',
      isSelfQA: true,
    };
    return this.runQA(context, signal);
  }

  /**
   * Runs Release Verification Pipeline.
   */
  public async verifyRelease(workspaceRoot: string, signal?: AbortSignal): Promise<QAReport> {
    const context: QAContext = {
      workspaceRoot,
      projectContext: {
        workspaceRoot,
        projectName: 'craftlens',
        hasTsConfig: true,
        isMonorepo: true,
        detectedFrameworks: ['vscode'],
      } as any,
      mode: 'release',
      isSelfQA: true,
    };
    return this.runQA(context, signal);
  }

  private selectAnalyzersForMode(mode: QAMode): QAAnalyzer[] {
    const allBuiltIn = [...this.builtInAnalyzers];
    const allExternal = [...this.externalAdapters];

    switch (mode) {
      case 'quick':
        return allBuiltIn.filter(a =>
          ['qa-typescript', 'qa-extension-manifest', 'qa-command-registry', 'qa-code-quality'].includes(a.id)
        );
      case 'security':
        return [
          ...allBuiltIn.filter(a => ['qa-security', 'qa-dependencies', 'qa-webview'].includes(a.id)),
          ...allExternal.filter(a => ['ext-semgrep', 'ext-codeql'].includes(a.id)),
        ];
      case 'change':
        return allBuiltIn.filter(a =>
          ['qa-typescript', 'qa-code-quality', 'qa-security', 'qa-runtime-safety'].includes(a.id)
        );
      case 'deep':
      case 'full':
      case 'release':
      case 'self':
      default:
        return [...allBuiltIn, ...allExternal];
    }
  }

  public getBuiltInAnalyzers(): QAAnalyzer[] {
    return this.builtInAnalyzers;
  }

  public getExternalAdapters(): QAAnalyzer[] {
    return this.externalAdapters;
  }
}

