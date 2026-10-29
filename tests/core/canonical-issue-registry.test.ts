import { describe, it, expect, beforeEach } from 'vitest';
import {
  IssueRegistry,
  Issue,
  findingToIssue,
  issueToFinding,
  computeStableIssueFingerprint,
  computeStructuralIssueFingerprint,
  reconcileIssues,
  Finding,
} from '@craftlens/core';

describe('CraftLens V2 Canonical Issue Registry & Fingerprinting', () => {
  let registry: IssueRegistry;
  const workspaceRoot = '/Users/test/my-project';

  beforeEach(() => {
    registry = new IssueRegistry(workspaceRoot);
  });

  it('creates and registers a canonical issue', () => {
    const rawFinding: Finding = {
      ruleId: 'SEC-001',
      title: 'Exposed API Token in Client',
      message: 'Client-side secret token detected',
      severity: 'error',
      confidence: 0.95,
      location: {
        filePath: `${workspaceRoot}/src/api/client.ts`,
        start: { line: 42, column: 5, offset: 500 },
        end: { line: 42, column: 35, offset: 530 },
      },
      evidence: [{ type: 'snippet', explanation: 'const token = "sk_live_123456";' }],
      whyItMatters: 'API tokens exposed in client code can be extracted by attackers.',
      recommendation: 'Move credentials to environment variables.',
    };

    const issue = findingToIssue(rawFinding);
    expect(issue.category).toBe('security');
    expect(issue.severity).toBe('high');
    expect(issue.status).toBe('open');
    expect(issue.locations[0].range.startLine).toBe(42);

    registry.registerIssue(issue);
    expect(registry.getAllIssues().length).toBe(1);
    expect(registry.getIssue(issue.id)).toBeDefined();
    expect(registry.getOpenIssues().length).toBe(1);
  });

  it('produces stable fingerprints independent of line numbers shifting', () => {
    const fp1 = computeStableIssueFingerprint({
      ruleId: 'AX-016',
      category: 'accessibility',
      filePath: `${workspaceRoot}/src/components/Button.tsx`,
      codeSnippet: '<button onClick={handleClick} />',
      evidence: [{ type: 'snippet', message: 'Missing accessible label' }],
      location: { range: { startLine: 42, startColumn: 3, endLine: 42, endColumn: 35 } },
      workspaceRoot,
    });

    // Code shifts from line 42 to line 105 during refactoring
    const fp2 = computeStableIssueFingerprint({
      ruleId: 'AX-016',
      category: 'accessibility',
      filePath: `${workspaceRoot}/src/components/Button.tsx`,
      codeSnippet: '<button onClick={handleClick} />',
      evidence: [{ type: 'snippet', message: 'Missing accessible label' }],
      location: { range: { startLine: 105, startColumn: 3, endLine: 105, endColumn: 35 } },
      workspaceRoot,
    });

    expect(fp1).toBe(fp2);

    // Genuinely new issue receives a different fingerprint
    const fp3 = computeStableIssueFingerprint({
      ruleId: 'SEC-001',
      category: 'security',
      filePath: `${workspaceRoot}/src/components/Button.tsx`,
      codeSnippet: 'eval(userInput)',
      evidence: [{ type: 'snippet', message: 'eval call detected' }],
      workspaceRoot,
    });

    expect(fp3).not.toBe(fp1);
  });

  it('reconciles findings when lines change without duplicating the issue', () => {
    const file = `${workspaceRoot}/src/components/Card.tsx`;
    const initialFindings: Finding[] = [
      {
        ruleId: 'UI-006',
        title: 'Unpadded card container',
        message: 'Card lacks internal padding token',
        severity: 'warning',
        location: {
          filePath: file,
          start: { line: 15, column: 1, offset: 120 },
          end: { line: 15, column: 20, offset: 140 },
        },
        evidence: [{ snippet: '<div className="card">' }],
      },
    ];

    // 1. Initial scan
    const r1 = registry.reconcile({ type: 'file', filePath: file }, initialFindings);
    expect(r1.added.length).toBe(1);
    expect(registry.getOpenIssues().length).toBe(1);
    const initialIssue = registry.getOpenIssues()[0];

    // 2. Developer adds lines above, moving issue from line 15 to line 28
    const movedFindings: Finding[] = [
      {
        ruleId: 'UI-006',
        title: 'Unpadded card container',
        message: 'Card lacks internal padding token',
        severity: 'warning',
        location: {
          filePath: file,
          start: { line: 28, column: 1, offset: 250 },
          end: { line: 28, column: 20, offset: 270 },
        },
        evidence: [{ snippet: '<div className="card">' }],
      },
    ];

    const r2 = registry.reconcile({ type: 'file', filePath: file }, movedFindings);
    expect(r2.added.length).toBe(0); // Not a new issue!
    expect(r2.updated.length).toBe(1); // Updated existing issue
    expect(registry.getOpenIssues().length).toBe(1); // Still only 1 issue

    const updatedIssue = registry.getIssue(initialIssue.id)!;
    expect(updatedIssue.locations[0].range.startLine).toBe(28);
  });

  it('preserves unrelated project issues during a single-file rescan', () => {
    const fileA = `${workspaceRoot}/src/FileA.tsx`;
    const fileB = `${workspaceRoot}/src/FileB.tsx`;

    // Scan File A
    registry.reconcile({ type: 'file', filePath: fileA }, [
      {
        ruleId: 'UI-001',
        title: 'Issue in File A',
        message: 'Problem in A',
        severity: 'warning',
        location: { filePath: fileA, start: { line: 10, column: 1, offset: 0 }, end: { line: 10, column: 10, offset: 10 } },
      },
    ]);

    // Scan File B
    registry.reconcile({ type: 'file', filePath: fileB }, [
      {
        ruleId: 'SEC-001',
        title: 'Security in File B',
        message: 'Problem in B',
        severity: 'error',
        location: { filePath: fileB, start: { line: 20, column: 1, offset: 0 }, end: { line: 20, column: 10, offset: 10 } },
      },
    ]);

    expect(registry.getAllIssues().length).toBe(2);

    // Rescan File A with 0 issues (developer fixed File A)
    const rescan = registry.reconcile({ type: 'file', filePath: fileA }, []);
    expect(rescan.resolved.length).toBe(1);

    // Crucial rule: File B issue MUST NOT be deleted
    const issuesInB = registry.getIssuesForFile(fileB);
    expect(issuesInB.length).toBe(1);
    expect(issuesInB[0].ruleId).toBe('SEC-001');
    expect(issuesInB[0].status).toBe('open');
  });

  it('marks issues as needs-revalidation rather than deleting during partial scans', () => {
    const file = `${workspaceRoot}/src/Partial.tsx`;
    registry.reconcile({ type: 'file', filePath: file }, [
      {
        ruleId: 'AP-008',
        title: 'Exception Swallowed',
        message: 'Empty catch block',
        severity: 'error',
        location: { filePath: file, start: { line: 12, column: 1, offset: 0 }, end: { line: 14, column: 1, offset: 10 } },
      },
    ]);

    expect(registry.getOpenIssues().length).toBe(1);

    // Partial scan ran (e.g. fast token scan did not execute full AST)
    const partialResult = registry.reconcile(
      { type: 'file', filePath: file, isPartialScan: true },
      []
    );

    expect(partialResult.stale.length).toBe(1);
    const staleIssue = registry.getIssue(partialResult.stale[0].id)!;
    expect(staleIssue.status).toBe('needs-revalidation');
  });

  it('supports resolving, dismissing, and updating issue lifecycle', () => {
    const file = `${workspaceRoot}/src/Lifecycle.tsx`;
    registry.reconcile({ type: 'file', filePath: file }, [
      {
        ruleId: 'AP-014',
        title: 'Any Escape Hatch',
        message: 'Avoid explicit any type',
        severity: 'warning',
        location: { filePath: file, start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 10, offset: 10 } },
      },
    ]);

    const issue = registry.getAllIssues()[0];

    // Dismiss with reason
    registry.dismissIssue(issue.id, 'Legacy third-party untyped library dependency');
    const dismissed = registry.getIssue(issue.id)!;
    expect(dismissed.status).toBe('ignored');
    expect(dismissed.dismissed?.reason).toContain('Legacy third-party');

    // Resolve
    registry.resolveIssue(issue.id, 'Refactored to unknown with type guard');
    const resolved = registry.getIssue(issue.id)!;
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toBeDefined();
  });
});
