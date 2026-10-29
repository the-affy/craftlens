import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  CraftLensQAEngine,
  IssueRegistry,
  QAContext,
  EvidenceNormalizer,
  MultiPassReviewEngine,
  FindingCorrelator,
  ReleaseGate,
  TypeScriptAnalyzer,
  SecurityAnalyzer,
  CodeQualityAnalyzer,
  RuntimeSafetyAnalyzer,
  WebviewAnalyzer,
  DependencyAnalyzer,
  PackagingAnalyzer,
  CommandRegistryAnalyzer,
  StateConsistencyAnalyzer,
  FixEngineAnalyzer,
  CraftLensArchitectureAnalyzer,
  ESLintAdapter,
  SemgrepAdapter,
  CodeQLAdapter,
  getConfidenceTier,
} from '@craftlens/core';

describe('QA, Code Review & Release Assurance Engine', () => {
  const root = path.resolve(__dirname, '../..');
  let issueRegistry: IssueRegistry;
  let qaEngine: CraftLensQAEngine;

  beforeEach(() => {
    issueRegistry = new IssueRegistry(root);
    qaEngine = new CraftLensQAEngine(issueRegistry);
  });

  describe('1. Confidence System & Tiers', () => {
    it('accurately maps numerical confidence scores to confidence tiers', () => {
      expect(getConfidenceTier(0.97)).toBe('very_high');
      expect(getConfidenceTier(0.88)).toBe('high');
      expect(getConfidenceTier(0.65)).toBe('probable');
      expect(getConfidenceTier(0.45)).toBe('weak');
      expect(getConfidenceTier(0.25)).toBe('speculative');
    });
  });

  describe('2. Built-in Analyzers on Known Fixtures', () => {
    it('TypeScriptAnalyzer detects unsafe boundary property chains', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const fixtureFile = path.join(root, 'qa-fixtures', 'bugs', 'null-boundary.ts');
      const ctx: QAContext = {
        workspaceRoot: root,
        projectContext: { workspaceRoot: root } as any,
        mode: 'full',
        changedFiles: [fixtureFile],
      };

      const result = await analyzer.analyze(ctx);
      expect(result.findings.length).toBeGreaterThan(0);
      const boundaryFinding = result.findings.find(f => f.ruleId === 'TS-BOUNDARY-NULL-ACCESS');
      expect(boundaryFinding).toBeDefined();
      expect(boundaryFinding?.severity).toBe('medium');
    });

    it('SecurityAnalyzer detects command injection and exposed secrets', async () => {
      const analyzer = new SecurityAnalyzer();
      const cmdFixture = path.join(root, 'qa-fixtures', 'security', 'command-injection.ts');
      const secretFixture = path.join(root, 'qa-fixtures', 'security', 'hardcoded-secret.ts');

      const ctx: QAContext = {
        workspaceRoot: root,
        projectContext: { workspaceRoot: root } as any,
        mode: 'security',
        changedFiles: [cmdFixture, secretFixture],
      };

      const result = await analyzer.analyze(ctx);
      const injectFinding = result.findings.find(f => f.ruleId === 'SEC-COMMAND-INJECTION');
      const secretFinding = result.findings.find(f => f.ruleId === 'SEC-SECRET-OPENAI');

      expect(injectFinding).toBeDefined();
      expect(injectFinding?.severity).toBe('critical');

      expect(secretFinding).toBeDefined();
      expect(secretFinding?.severity).toBe('critical');
    });

    it('CodeQualityAnalyzer detects empty swallowed exception blocks', async () => {
      const analyzer = new CodeQualityAnalyzer();
      const fixture = path.join(root, 'qa-fixtures', 'code-quality', 'swallowed-exception.ts');
      const ctx: QAContext = {
        workspaceRoot: root,
        projectContext: { workspaceRoot: root } as any,
        mode: 'full',
        changedFiles: [fixture],
      };

      const result = await analyzer.analyze(ctx);
      const swallowed = result.findings.find(f => f.ruleId === 'CQ-EXCEPTION-SWALLOWING');
      expect(swallowed).toBeDefined();
      expect(swallowed?.confidence).toBeGreaterThanOrEqual(0.90);
    });

    it('RuntimeSafetyAnalyzer detects undisposed timers', async () => {
      const analyzer = new RuntimeSafetyAnalyzer();
      const fixture = path.join(root, 'qa-fixtures', 'runtime', 'undisposed-timer.ts');
      const ctx: QAContext = {
        workspaceRoot: root,
        projectContext: { workspaceRoot: root } as any,
        mode: 'full',
        changedFiles: [fixture],
      };

      const result = await analyzer.analyze(ctx);
      const timerFinding = result.findings.find(f => f.ruleId === 'RUNTIME-UNDISPOSED-TIMER');
      expect(timerFinding).toBeDefined();
      expect(timerFinding?.severity).toBe('medium');
    });

    it('Clean fixture produces zero false positives', async () => {
      const tsAnalyzer = new TypeScriptAnalyzer();
      const secAnalyzer = new SecurityAnalyzer();
      const cqAnalyzer = new CodeQualityAnalyzer();

      const cleanFile = path.join(root, 'qa-fixtures', 'clean', 'clean-module.ts');
      const ctx: QAContext = {
        workspaceRoot: root,
        projectContext: { workspaceRoot: root } as any,
        mode: 'full',
        changedFiles: [cleanFile],
      };

      const resTs = await tsAnalyzer.analyze(ctx);
      const resSec = await secAnalyzer.analyze(ctx);
      const resCq = await cqAnalyzer.analyze(ctx);

      expect(resTs.findings.length).toBe(0);
      expect(resSec.findings.length).toBe(0);
      expect(resCq.findings.length).toBe(0);
    });
  });

  describe('3. Evidence Normalization & Multi-Pass Review', () => {
    it('EvidenceNormalizer enforces Evidence-First and generates stable fingerprints', () => {
      const normalizer = new EvidenceNormalizer();
      const valid = normalizer.normalize(
        {
          ruleId: 'SEC-001',
          title: 'Hardcoded Secret',
          message: 'Found exposed API token',
          category: 'security',
          severity: 'critical',
          confidence: 0.95,
          filePath: 'src/api.ts',
          startLine: 10,
          sourceAnalyzer: 'craftlens-security',
          evidence: [
            {
              type: 'security_sink',
              description: 'Pattern match for sk-proj',
              source: 'craftlens-security',
              filePath: 'src/api.ts',
              line: 10,
            },
          ],
        },
        root
      );

      expect(valid.accepted).toBe(true);
      expect(valid.finding?.fingerprint).toBe('qa:SEC-001:src/api.ts:L10');
      expect(valid.finding?.inference).toBeDefined();
      expect(valid.finding?.recommendation).toBeDefined();

      // Discards speculative findings with low confidence and no evidence
      const invalid = normalizer.normalize(
        {
          ruleId: 'SPEC-001',
          title: 'Speculative issue',
          message: 'Might be bad',
          category: 'quality',
          severity: 'low',
          confidence: 0.2,
          filePath: '',
          sourceAnalyzer: 'speculative',
          evidence: [],
        },
        root
      );

      expect(invalid.accepted).toBe(false);
      expect(invalid.discardReason).toContain('Evidence First');
    });

    it('MultiPassReviewEngine subjects high-risk findings to adversarial review', () => {
      const reviewer = new MultiPassReviewEngine();

      // Case 1: Unsubstantiated high-risk finding rejected by Reviewer A
      const noEvidenceFinding = {
        ruleId: 'SEC-COMMAND-INJECTION',
        title: 'Unsafe shell command',
        message: 'Could be unsafe',
        category: 'security' as const,
        severity: 'critical' as const,
        confidence: 0.9,
        filePath: 'src/exec.ts',
        startLine: 5,
        sourceAnalyzer: 'craftlens-security',
        evidence: [],
      };
      const reviewA = reviewer.reviewFinding(noEvidenceFinding, root);
      expect(reviewA.accepted).toBe(false);
      expect(reviewA.reviewerA.passed).toBe(false);

      // Case 2: Concrete high-risk finding accepted and boosted
      const validFinding = {
        ruleId: 'SEC-COMMAND-INJECTION',
        title: 'Unsafe shell command',
        message: 'Direct dynamic execution',
        category: 'security' as const,
        severity: 'critical' as const,
        confidence: 0.92,
        filePath: 'src/exec.ts',
        startLine: 5,
        sourceAnalyzer: 'craftlens-security',
        evidence: [
          {
            type: 'security_sink',
            description: 'exec with template string',
            source: 'craftlens-security',
            filePath: 'src/exec.ts',
            line: 5,
          },
        ],
      };
      const reviewValid = reviewer.reviewFinding(validFinding, root);
      expect(reviewValid.accepted).toBe(true);
      expect(reviewValid.reviewerA.passed).toBe(true);
      expect(reviewValid.reviewerB.disproven).toBe(false);
      expect(reviewValid.finalConfidence).toBeGreaterThanOrEqual(0.92);
    });
  });

  describe('4. Finding Correlation & Issue Registry Single Source of Truth', () => {
    it('correlates multiple findings from different analyzers into one canonical Issue', () => {
      const correlator = new FindingCorrelator(issueRegistry);

      const finding1 = {
        ruleId: 'SEC-INJECT-01',
        title: 'Command Injection Risk',
        message: 'child_process.exec called with dynamic input',
        category: 'security' as const,
        severity: 'critical' as const,
        confidence: 0.90,
        filePath: 'src/runner.ts',
        startLine: 42,
        sourceAnalyzer: 'craftlens-security',
        evidence: [
          {
            type: 'security_sink',
            description: 'Traced dynamic parameter to exec()',
            source: 'craftlens-security',
            filePath: 'src/runner.ts',
            line: 42,
          },
        ],
      };

      const finding2 = {
        ruleId: 'SEC-INJECT-SEMGREP',
        title: 'Unsafe exec execution',
        message: 'Semgrep rule generic.exec.dynamic detected',
        category: 'security' as const,
        severity: 'high' as const,
        confidence: 0.88,
        filePath: 'src/runner.ts',
        startLine: 43,
        sourceAnalyzer: 'semgrep',
        evidence: [
          {
            type: 'external_tool',
            description: 'Semgrep AST pattern match on line 43',
            source: 'semgrep',
            filePath: 'src/runner.ts',
            line: 43,
          },
        ],
      };

      const { correlated, canonicalIssues } = correlator.correlate([
        { finding: finding1 },
        { finding: finding2 },
      ]);

      expect(correlated.length).toBe(1);
      const unified = correlated[0];

      // Multi-tool confirmation elevates confidence
      expect(unified.confidence).toBeGreaterThan(0.90);
      expect(unified.sources).toContain('craftlens-security');
      expect(unified.sources).toContain('semgrep');
      expect(unified.evidence.length).toBe(2);

      // Verify canonical issue registered in single source of truth IssueRegistry
      expect(canonicalIssues.length).toBe(1);
      const inRegistry = issueRegistry.getIssueById(unified.canonicalIssueId!);
      expect(inRegistry).toBeDefined();
      expect(inRegistry?.title).toBe(unified.title);
      expect(inRegistry?.category).toBe('security');
    });
  });

  describe('5. Release Gate Evaluation', () => {
    it('blocks release when critical or high security issues exist', () => {
      const gate = new ReleaseGate();
      const mockFindings: any[] = [
        {
          id: '1',
          ruleId: 'SEC-COMMAND-INJECTION',
          title: 'Command injection vulnerability',
          category: 'security',
          severity: 'critical',
          primaryLocation: { filePath: 'src/cli.ts', startLine: 12 },
        },
      ];

      const evalRes = gate.evaluate([], mockFindings);
      expect(evalRes.verdict).toBe('RELEASE BLOCKED');
      expect(evalRes.blockerCount).toBe(1);
      expect(evalRes.reasons[0]).toContain('[CRITICAL]');
    });

    it('passes with warnings when only medium or low findings exist', () => {
      const gate = new ReleaseGate();
      const mockFindings: any[] = [
        {
          id: '2',
          ruleId: 'TS-UNSAFE-TYPE-CAST',
          title: 'Unsafe as any',
          category: 'quality',
          severity: 'low',
          primaryLocation: { filePath: 'src/utils.ts', startLine: 4 },
        },
        {
          id: '3',
          ruleId: 'CQ-EXCEPTION-SWALLOWING',
          title: 'Swallowed error',
          category: 'quality',
          severity: 'medium',
          primaryLocation: { filePath: 'src/parser.ts', startLine: 20 },
        },
      ];

      const evalRes = gate.evaluate([], mockFindings);
      expect(evalRes.verdict).toBe('RELEASE PASS WITH WARNINGS');
      expect(evalRes.blockerCount).toBe(0);
      expect(evalRes.warningCount).toBe(2);
    });

    it('returns clean RELEASE PASS when 0 issues and 0 warnings exist', () => {
      const gate = new ReleaseGate();
      const evalRes = gate.evaluate(
        [{ analyzerId: 'ts', analyzerName: 'TypeScript', category: 'correctness', status: 'pass', durationMs: 10, findings: [] }],
        []
      );
      expect(evalRes.verdict).toBe('RELEASE PASS');
      expect(evalRes.blockerCount).toBe(0);
      expect(evalRes.warningCount).toBe(0);
    });
  });

  describe('6. External Adapters Graceful Handling', () => {
    it('safely handles missing external tools without failing or faking PASS', async () => {
      const semgrep = new SemgrepAdapter();
      const codeql = new CodeQLAdapter();
      const ctx: QAContext = {
        workspaceRoot: root,
        projectContext: { workspaceRoot: root } as any,
        mode: 'security',
      };

      const resSemgrep = await semgrep.analyze(ctx);
      const resCodeql = await codeql.analyze(ctx);

      expect(resSemgrep.status).toBe('not_available');
      expect(resSemgrep.notes).toContain('Optional analyzer skipped');
      expect(resCodeql.status).toBe('not_available');
      expect(resCodeql.notes).toContain('Optional analyzer skipped');
    });
  });

  describe('7. CraftLens Self-QA Dogfooding', () => {
    it('successfully runs full Self-QA across CraftLens monorepo', async () => {
      const report = await qaEngine.runSelfQA(root);

      expect(report.mode).toBe('self');
      expect(report.checks.length).toBeGreaterThanOrEqual(13);

      // Verify each built-in check has valid status
      for (const chk of report.checks) {
        expect(['pass', 'warn', 'fail', 'skipped', 'not_available', 'not_run']).toContain(chk.status);
      }

      // Check that gate evaluates cleanly
      expect(['RELEASE PASS', 'RELEASE PASS WITH WARNINGS', 'RELEASE BLOCKED']).toContain(report.gateResult);
      expect(typeof report.durationMs).toBe('number');
    });
  });
});

