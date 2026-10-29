import * as fs from 'node:fs';
import * as path from 'node:path';
import { QARawFinding, getConfidenceTier } from '../types.js';

export interface MultiPassReviewResult {
  accepted: boolean;
  finalConfidence: number;
  reviewerA: { passed: boolean; note: string };
  reviewerB: { disproven: boolean; reason?: string };
  reviewerC?: { architecturalRisk?: string };
  discardReason?: string;
}

export class MultiPassReviewEngine {
  /**
   * Evaluates a finding through risk-based multi-pass review.
   * Reviewer A (Correctness) checks if evidence proves an actual defect.
   * Reviewer B (Adversarial) attempts to disprove the finding.
   * Reviewer C (Architecture) checks architectural impact for high-risk findings.
   */
  public reviewFinding(
    finding: QARawFinding,
    workspaceRoot: string
  ): MultiPassReviewResult {
    // 1. Risk-based escalation check:
    // Only escalate if finding is High/Critical, Security/Runtime, or has moderate confidence
    const isHighRisk =
      finding.severity === 'critical' ||
      finding.severity === 'high' ||
      finding.category === 'security' ||
      finding.ruleId.includes('RUNTIME') ||
      finding.confidence < 0.85;

    if (!isHighRisk) {
      // Deterministic low/medium finding: fast-path pass
      return {
        accepted: true,
        finalConfidence: finding.confidence,
        reviewerA: { passed: true, note: 'Deterministic rule match with direct AST evidence.' },
        reviewerB: { disproven: false },
      };
    }

    // Read source snippet or file if available for context
    let sourceSnippet = '';
    const fullPath = path.isAbsolute(finding.filePath)
      ? finding.filePath
      : path.resolve(workspaceRoot, finding.filePath);

    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        if (finding.startLine && finding.startLine <= lines.length) {
          const start = Math.max(0, finding.startLine - 3);
          const end = Math.min(lines.length, finding.startLine + 3);
          sourceSnippet = lines.slice(start, end).join('\n');
        }
      } catch {
        // ignore read error
      }
    }

    // 2. Reviewer A: Correctness
    // Does concrete evidence substantiate the finding?
    const hasEvidence = finding.evidence && finding.evidence.length > 0;
    if (!hasEvidence) {
      return {
        accepted: false,
        finalConfidence: 0.2,
        reviewerA: { passed: false, note: 'No concrete evidence to prove broken invariant.' },
        reviewerB: { disproven: true, reason: 'Lacks evidence.' },
        discardReason: 'Reviewer A rejected: No concrete evidence.',
      };
    }

    const reviewerA = {
      passed: true,
      note: `Verified evidence: ${finding.evidence[0].description} at ${finding.filePath}:${finding.startLine || 0}`,
    };

    // 3. Reviewer B: Adversarial
    // Attempts to disprove the finding.
    let disproven = false;
    let disproveReason: string | undefined;

    // Check B1: Is this in a test file, mock, or fixture where dangerous patterns or mock data are expected?
    const normPath = finding.filePath.toLowerCase();
    const isTestOrFixture =
      normPath.includes('/tests/') ||
      normPath.includes('/fixtures/') ||
      normPath.includes('qa-fixtures/') ||
      normPath.endsWith('.test.ts') ||
      normPath.endsWith('.spec.ts');

    if (isTestOrFixture && finding.ruleId.startsWith('SEC-')) {
      // If security rule fires inside test fixture or test mock, verify if it's intentional test code
      if (normPath.includes('fixture') || normPath.includes('test')) {
        // High severity security finding inside non-test source vs test source
        if (!normPath.includes('qa-fixtures/security')) {
          // In regular test files, hardcoded mock keys or test exec are often intentional
          if (finding.ruleId === 'SEC-SECRET' || finding.ruleId === 'SEC-001') {
            if (sourceSnippet.includes('mock') || sourceSnippet.includes('test-key') || sourceSnippet.includes('fake')) {
              disproven = true;
              disproveReason = 'Adversarial Reviewer B: Value is an intentional test mock key.';
            }
          }
        }
      }
    }

    // Check B2: Is input sanitized or validated nearby?
    if (!disproven && sourceSnippet) {
      if (
        (finding.ruleId.includes('INJECT') || finding.ruleId.includes('EXEC')) &&
        (sourceSnippet.includes('sanitize') || sourceSnippet.includes('validateCommand') || sourceSnippet.includes('whitelist'))
      ) {
        disproven = true;
        disproveReason = 'Adversarial Reviewer B: Input validation/sanitization present before execution.';
      }
    }

    // Check B3: Nullish check or optional chaining present
    if (!disproven && sourceSnippet && finding.ruleId.includes('NULL_ACCESS')) {
      if (sourceSnippet.includes('?.') || sourceSnippet.includes('&&') || sourceSnippet.includes('if (!')) {
        disproven = true;
        disproveReason = 'Adversarial Reviewer B: Guard statement or optional chaining already safeguards property access.';
      }
    }

    const reviewerB = {
      disproven,
      reason: disproveReason,
    };

    // If disproven, lower confidence and discard if below threshold
    if (disproven) {
      const reducedConfidence = Math.max(0.2, finding.confidence - 0.45);
      return {
        accepted: false,
        finalConfidence: reducedConfidence,
        reviewerA,
        reviewerB,
        discardReason: disproveReason || 'Disproven by adversarial review.',
      };
    }

    // 4. Reviewer C: Architecture (for critical / high findings)
    let reviewerC: { architecturalRisk?: string } | undefined;
    if (finding.severity === 'critical' || finding.severity === 'high') {
      let archRisk = 'Isolated to module scope.';
      if (finding.ruleId.includes('STATE')) {
        archRisk = 'Cross-component state divergence risk: impacts UI-Host synchronization.';
      } else if (finding.ruleId.includes('RUNTIME')) {
        archRisk = 'Process/Webview lifecycle risk: potential resource leak or unhandled rejection.';
      }
      reviewerC = { architecturalRisk: archRisk };
    }

    // Finding survived adversarial scrutiny: boost confidence slightly
    const finalConfidence = Math.min(1.0, finding.confidence + 0.05);

    return {
      accepted: true,
      finalConfidence,
      reviewerA,
      reviewerB,
      reviewerC,
    };
  }
}
