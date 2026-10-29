import { CorrelatedFinding, QAResult, ReleaseGateResult } from '../types.js';

export interface GateEvaluation {
  verdict: ReleaseGateResult;
  reasons: string[];
  blockerCount: number;
  warningCount: number;
}

export class ReleaseGate {
  /**
   * Evaluates release assurance across analyzer results and findings.
   * Never fabricates a passing result.
   */
  public evaluate(
    analyzerResults: QAResult[],
    correlatedFindings: CorrelatedFinding[]
  ): GateEvaluation {
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Check analyzer execution statuses
    for (const res of analyzerResults) {
      if (res.status === 'fail') {
        blockers.push(`Analyzer failed: ${res.analyzerName} (${res.notes || 'Execution failure'})`);
      } else if (res.status === 'warn') {
        warnings.push(`Analyzer reported warnings: ${res.analyzerName} (${res.notes || 'Quality/Security warnings'})`);
      } else if (res.status === 'not_available') {
        warnings.push(`Optional analyzer not available: ${res.analyzerName}`);
      }
    }

    // 2. Check findings for critical release blockers
    for (const f of correlatedFindings) {
      // Critical severity findings always block release
      if (f.severity === 'critical') {
        blockers.push(`[CRITICAL] ${f.title} (${f.primaryLocation.filePath}:${f.primaryLocation.startLine})`);
        continue;
      }

      // High severity security or runtime findings block release
      if (f.severity === 'high' && (f.category === 'security' || f.ruleId.includes('RUNTIME'))) {
        blockers.push(`[HIGH SECURITY/RUNTIME] ${f.title} in ${f.primaryLocation.filePath}`);
        continue;
      }

      // Broken commands block release
      if (f.ruleId.includes('CMD-BROKEN') || f.ruleId.includes('MISSING_HANDLER')) {
        blockers.push(`[BROKEN COMMAND] ${f.title}`);
        continue;
      }

      // Build or TypeScript failures block release
      if (f.ruleId.includes('BUILD-FAIL') || f.ruleId.includes('TS-FAIL')) {
        blockers.push(`[BUILD/TS FAILURE] ${f.title}`);
        continue;
      }

      // Test failures block release
      if (f.ruleId.includes('TEST-FAIL')) {
        blockers.push(`[TEST FAILURE] ${f.title}`);
        continue;
      }

      // VSIX / Packaging corruption blocks release
      if (f.ruleId.includes('VSIX-CORRUPT') || f.ruleId.includes('PKG-CORRUPT')) {
        blockers.push(`[PACKAGING FAILURE] ${f.title}`);
        continue;
      }

      // Non-blocking findings become warnings
      if (f.severity === 'medium' || f.severity === 'high' || f.severity === 'low' || f.severity === 'suggestion') {
        warnings.push(`[${f.severity.toUpperCase()}] ${f.title} in ${f.primaryLocation.filePath}`);
      }
    }

    let verdict: ReleaseGateResult = 'RELEASE PASS';
    if (blockers.length > 0) {
      verdict = 'RELEASE BLOCKED';
    } else if (warnings.length > 0) {
      verdict = 'RELEASE PASS WITH WARNINGS';
    }

    return {
      verdict,
      reasons: blockers.length > 0 ? blockers : warnings,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    };
  }
}
