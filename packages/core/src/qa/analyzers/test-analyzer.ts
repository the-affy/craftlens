import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export interface TestClassification {
  unit: string[];
  integration: string[];
  extensionHost: string[];
  webview: string[];
  security: string[];
  regression: string[];
  buildAndPackaging: string[];
}

export class TestAnalyzer implements QAAnalyzer {
  id = 'qa-tests';
  name = 'Test Suite & Regression Coverage Analyzer';
  category: QACategory = 'tests';

  async isAvailable(context: QAContext): Promise<boolean> {
    const testsDir = path.join(context.workspaceRoot, 'tests');
    return fs.existsSync(testsDir);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const testsDir = path.join(root, 'tests');
    if (!fs.existsSync(testsDir)) {
      return {
        analyzerId: this.id,
        analyzerName: this.name,
        category: this.category,
        status: 'skipped',
        durationMs: Date.now() - start,
        findings: [],
        skipReason: 'tests directory not found.',
      };
    }

    const testFiles: string[] = [];
    this.walkTests(testsDir, testFiles);

    // Classify tests
    const classification: TestClassification = {
      unit: [],
      integration: [],
      extensionHost: [],
      webview: [],
      security: [],
      regression: [],
      buildAndPackaging: [],
    };

    let allTestContent = '';

    for (const tf of testFiles) {
      const rel = path.relative(root, tf).split(path.sep).join('/');
      try {
        const content = fs.readFileSync(tf, 'utf-8');
        allTestContent += '\n' + content;
      } catch {}

      if (rel.includes('/integration/packaged-vsix') || rel.includes('packaging')) {
        classification.buildAndPackaging.push(rel);
      } else if (rel.includes('/security') || rel.includes('SEC-')) {
        classification.security.push(rel);
      } else if (rel.includes('dashboard') || rel.includes('overview') || rel.includes('sidebar') || rel.includes('contrast')) {
        classification.webview.push(rel);
      } else if (rel.includes('repair') || rel.includes('regression') || rel.includes('sync') || rel.includes('validation')) {
        classification.regression.push(rel);
      } else if (rel.includes('/integration/')) {
        classification.integration.push(rel);
      } else if (rel.includes('/vscode/')) {
        classification.extensionHost.push(rel);
      } else {
        classification.unit.push(rel);
      }
    }

    // Verify 12 Mandatory Regression Scenarios
    const mandatoryRequirements: { key: string; name: string; pattern: RegExp }[] = [
      { key: 'malformed-location', name: 'Malformed issue location handling', pattern: /malformed.*location|location.*normalize|invalid.*range/i },
      { key: 'malformed-rec', name: 'Malformed recommendation handling', pattern: /malformed.*recommendation|recommendation.*fallback/i },
      { key: 'invalid-transform', name: 'Invalid transformation rejection', pattern: /invalid.*transform|syntax.*reject|cannot parse/i },
      { key: 'missing-cmd', name: 'Missing command check', pattern: /missing.*command|registerCommand|unregistered/i },
      { key: 'selected-issue-sync', name: 'Selected issue synchronization', pattern: /selectedIssueId|selected issue|single source of truth/i },
      { key: 'fix-capability-consistency', name: 'Inconsistent fix capability check', pattern: /FixCapability|resolveFixCapability|fix.*consisten/i },
      { key: 'apply-fix-crash', name: 'Apply Fix crash resilience', pattern: /applyChange|applyFix|atomic.*apply/i },
      { key: 'malformed-skill', name: 'Malformed skill package handling', pattern: /malformed.*skill|validateSkill|corrupted skill/i },
      { key: 'stale-patch', name: 'Stale patch rejection', pattern: /stale.*patch|checksum|outdated/i },
      { key: 'failed-verification', name: 'Failed verification handling', pattern: /failed.*verif|verification.*status/i },
      { key: 'rollback', name: 'Atomic rollback on error', pattern: /rollback|restoreOriginalFiles|revert/i },
      { key: 'webview-msg-mismatch', name: 'Webview message schema validation', pattern: /postMessage|webview.*message|onDidReceiveMessage/i },
    ];

    const missingScenarios: string[] = [];
    for (const req of mandatoryRequirements) {
      if (!req.pattern.test(allTestContent)) {
        missingScenarios.push(req.name);
      }
    }

    if (missingScenarios.length > 0) {
      findings.push({
        ruleId: 'TEST-MISSING-REGRESSION-COVERAGE',
        title: 'Missing mandatory QA regression coverage scenarios',
        message: `Test suite lacks coverage for ${missingScenarios.length} mandatory regression scenario(s): ${missingScenarios.join(', ')}.`,
        category: 'quality',
        severity: 'medium',
        confidence: 0.90,
        filePath: 'tests/',
        sourceAnalyzer: this.id,
        evidence: [
          {
            type: 'test_gap',
            description: `Scenarios not detected in test assertions: ${missingScenarios.join(', ')}`,
            source: this.id,
            filePath: 'tests/',
          },
        ],
        inference: 'Untested regression scenarios risk regressions re-entering unnoticed.',
        recommendation: 'Add targeted vitest tests for missing scenarios.',
      });
    }

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: findings.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      findings,
      metrics: {
        totalTestSuites: testFiles.length,
        unitSuites: classification.unit.length,
        integrationSuites: classification.integration.length,
        extensionHostSuites: classification.extensionHost.length,
        webviewSuites: classification.webview.length,
        securitySuites: classification.security.length,
        regressionSuites: classification.regression.length,
        packagingSuites: classification.buildAndPackaging.length,
        mandatoryScenariosMet: mandatoryRequirements.length - missingScenarios.length,
      },
      notes: `Discovered and classified ${testFiles.length} test suites across 7 categories.`,
    };
  }

  private walkTests(dir: string, results: string[]): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.walkTests(full, results);
        } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts'))) {
          results.push(full);
        }
      }
    } catch {
      // ignore
    }
  }
}

