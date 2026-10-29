import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  IssueRegistry,
  findingToIssue,
  ChangeManager,
  VerificationEngine,
  Finding,
} from '@craftlens/core';

describe('CraftLens V2 Change Workflow & Verification Engine', () => {
  let tempDir: string;
  let registry: IssueRegistry;
  let changeManager: ChangeManager;
  let verificationEngine: VerificationEngine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftlens-change-test-'));
    registry = new IssueRegistry(tempDir);
    changeManager = new ChangeManager(registry, tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('creates an improvement plan and links canonical issues', () => {
    const rawFinding: Finding = {
      ruleId: 'SEC-001',
      title: 'Insecure Client Secret',
      message: 'Client API key exposed',
      severity: 'error',
      location: {
        filePath: path.join(tempDir, 'src/api.ts'),
        start: { line: 10, column: 1, offset: 100 },
        end: { line: 10, column: 40, offset: 140 },
      },
    };
    const issue = findingToIssue(rawFinding);
    registry.registerIssue(issue);

    const plan = changeManager.createPlan(
      'Fix Security Token Exposures',
      'Move client API tokens to server-side proxy',
      [issue.id]
    );

    expect(plan.id).toBeDefined();
    expect(plan.title).toBe('Fix Security Token Exposures');
    expect(plan.issueIds).toEqual([issue.id]);

    const linkedIssue = registry.getIssue(issue.id)!;
    expect(linkedIssue.status).toBe('planned');
    expect(linkedIssue.changeIds).toContain(plan.id);
  });

  it('generates, reviews, approves, and rejects proposed changes', () => {
    const rawFinding: Finding = {
      ruleId: 'UI-006',
      title: 'Inconsistent Button Spacing',
      message: 'Margin token violation',
      severity: 'warning',
      location: {
        filePath: path.join(tempDir, 'src/Button.tsx'),
        start: { line: 5, column: 1, offset: 50 },
        end: { line: 5, column: 20, offset: 70 },
      },
    };
    const issue = findingToIssue(rawFinding);
    registry.registerIssue(issue);

    const plan = changeManager.createPlan('Button Alignment', 'Normalize margin', [issue.id]);
    const change = changeManager.proposeChange(
      plan.id,
      'Normalize Button Spacing',
      'Use gap-2 instead of arbitrary margin',
      [issue.id],
      [
        {
          filePath: 'src/Button.tsx',
          additions: 1,
          deletions: 1,
          originalContent: '<button style={{ margin: 13 }} />',
          newContent: '<button className="gap-2" />',
        },
      ]
    );

    expect(change.status).toBe('proposed');
    expect(change.files.length).toBe(1);

    // Approve proposal
    const approved = changeManager.approveChange(change.id);
    expect(approved).toBe(true);
    expect(changeManager.getChange(change.id)!.status).toBe('approved');

    // Reject proposal with reason
    const rejected = changeManager.rejectChange(change.id, 'Design team requested flexbox layout instead');
    expect(rejected).toBe(true);
    const rejectedChange = changeManager.getChange(change.id)!;
    expect(rejectedChange.status).toBe('rejected');
    expect(rejectedChange.rejectionReason).toContain('Design team requested');
  });

  it('enforces safety rules: prevents path traversal attempts', async () => {
    const rawFinding: Finding = {
      ruleId: 'SEC-001',
      title: 'Path Traversal',
      message: 'Bad path',
      severity: 'error',
      location: {
        filePath: path.join(tempDir, 'src/test.ts'),
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 10 },
      },
    };
    const issue = findingToIssue(rawFinding);
    registry.registerIssue(issue);

    const plan = changeManager.createPlan('Malicious Plan', 'Test traversal', [issue.id]);
    const maliciousChange = changeManager.proposeChange(
      plan.id,
      'Escape Workspace',
      'Should be blocked',
      [issue.id],
      [
        {
          filePath: '../../../../../../etc/passwd',
          additions: 1,
          deletions: 0,
          newContent: 'root:hacked',
        },
      ]
    );

    const applyResult = await changeManager.applyChange(maliciousChange.id);
    expect(applyResult.success).toBe(false);
    expect(applyResult.error).toContain('Path traversal');
  });

  it('enforces safety rules: detects modified files on disk and aborts without overwriting', async () => {
    const testFile = path.join(tempDir, 'src/Component.tsx');
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, 'initial code line 1\ninitial code line 2', 'utf-8');

    const rawFinding: Finding = {
      ruleId: 'AP-008',
      title: 'Exception Swallowed',
      message: 'Empty catch',
      severity: 'error',
      location: {
        filePath: testFile,
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 10 },
      },
    };
    const issue = findingToIssue(rawFinding);
    registry.registerIssue(issue);

    const plan = changeManager.createPlan('Fix Exception', 'Add logger', [issue.id]);
    const change = changeManager.proposeChange(
      plan.id,
      'Fix catch block',
      'Log exception',
      [issue.id],
      [
        {
          filePath: 'src/Component.tsx',
          additions: 1,
          deletions: 1,
          originalContent: 'initial code line 1\ninitial code line 2',
          newContent: 'initial code line 1\nconsole.error(err);',
        },
      ]
    );

    // Simulate developer modifying file on disk while proposal was pending
    fs.writeFileSync(testFile, 'developer edited file concurrently!', 'utf-8');

    const applyResult = await changeManager.applyChange(change.id);
    expect(applyResult.success).toBe(false);
    expect(applyResult.error).toContain('unexpectedly changed');
    // Verify file was NOT modified by aborted apply
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('developer edited file concurrently!');
  });

  it('guarantees atomic transactions with rollback on multi-file changes', async () => {
    const file1 = path.join(tempDir, 'src/File1.tsx');
    const file2 = path.join(tempDir, 'src/File2.tsx');
    fs.mkdirSync(path.dirname(file1), { recursive: true });
    fs.writeFileSync(file1, 'original file 1 content', 'utf-8');
    fs.writeFileSync(file2, 'original file 2 content', 'utf-8');

    const plan = changeManager.createPlan('Multi-file transaction', 'Two files', []);
    const change = changeManager.proposeChange(
      plan.id,
      'Batch update',
      'Update 1 and 2, but 2 will have invalid traversal',
      [],
      [
        {
          filePath: 'src/File1.tsx',
          additions: 1,
          deletions: 1,
          originalContent: 'original file 1 content',
          newContent: 'new file 1 content',
        },
        {
          filePath: '../../outside-workspace.txt',
          additions: 1,
          deletions: 0,
          newContent: 'escape attempt',
        },
      ]
    );

    const applyResult = await changeManager.applyChange(change.id);
    expect(applyResult.success).toBe(false);

    // Atomicity check: File 1 MUST NOT have been changed because File 2 failed validation!
    expect(fs.readFileSync(file1, 'utf-8')).toBe('original file 1 content');
    expect(fs.readFileSync(file2, 'utf-8')).toBe('original file 2 content');
  });

  it('applies safe changes cleanly and supports reverting', async () => {
    const file = path.join(tempDir, 'src/Safe.tsx');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const originalCode = 'const x: any = 42;';
    fs.writeFileSync(file, originalCode, 'utf-8');

    const rawFinding: Finding = {
      ruleId: 'AP-014',
      title: 'Any Escape Hatch',
      message: 'Avoid any',
      severity: 'warning',
      location: {
        filePath: file,
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 17, offset: 17 },
      },
    };
    const issue = findingToIssue(rawFinding);
    registry.registerIssue(issue);

    const plan = changeManager.createPlan('Fix Any', 'Type as unknown', [issue.id]);
    const change = changeManager.proposeChange(
      plan.id,
      'Replace any with unknown',
      'Safe typing',
      [issue.id],
      [
        {
          filePath: 'src/Safe.tsx',
          additions: 1,
          deletions: 1,
          originalContent: originalCode,
          newContent: 'const x: unknown = 42;',
        },
      ]
    );

    // Apply
    const applyResult = await changeManager.applyChange(change.id);
    expect(applyResult.success).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toBe('const x: unknown = 42;');

    const appliedIssue = registry.getIssue(issue.id)!;
    expect(appliedIssue.status).toBe('applied');

    // Revert
    const revertResult = await changeManager.revertChange(change.id);
    expect(revertResult.success).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toBe(originalCode);
    expect(changeManager.getChange(change.id)!.status).toBe('reverted');
  });

  it('Verification Engine: Applied ≠ Verified; marks issue resolved only when targeted checks pass', async () => {
    const file = path.join(tempDir, 'src/Secure.tsx');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'const secret = "live_123";', 'utf-8');

    const rawFinding: Finding = {
      ruleId: 'SEC-001',
      title: 'Hardcoded Secret',
      message: 'Secret detected',
      severity: 'error',
      location: {
        filePath: file,
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 25, offset: 25 },
      },
    };
    const issue = findingToIssue(rawFinding);
    registry.registerIssue(issue);

    // Mock audit content evaluator: returns findings if content still contains "live_123"
    const mockAuditEvaluator = async (filePath: string, content: string): Promise<Finding[]> => {
      if (content.includes('live_123')) {
        return [rawFinding];
      }
      return [];
    };

    verificationEngine = new VerificationEngine(
      registry,
      changeManager,
      mockAuditEvaluator,
      tempDir
    );

    const plan = changeManager.createPlan('Remove Secret', 'Use env var', [issue.id]);

    // 1. Ineffective change: still contains secret
    const badChange = changeManager.proposeChange(
      plan.id,
      'Rename secret variable but keep value',
      'Ineffective fix',
      [issue.id],
      [
        {
          filePath: 'src/Secure.tsx',
          additions: 1,
          deletions: 1,
          originalContent: 'const secret = "live_123";',
          newContent: 'const apiKey = "live_123";',
        },
      ]
    );

    await changeManager.applyChange(badChange.id);
    expect(registry.getIssue(issue.id)!.status).toBe('applied');

    // Run verification on ineffective change
    const badVerification = await verificationEngine.verifyChange(badChange.id);
    expect(badVerification.status).toBe('failed');
    expect(badVerification.checks[0].status).toBe('failed');
    // Crucial rule: issue is NOT marked resolved when verification fails!
    expect(registry.getIssue(issue.id)!.status).toBe('open');
    expect(registry.getIssue(issue.id)!.resolvedAt).toBeUndefined();

    // 2. Genuine fix: replaces secret with process.env.API_KEY
    const goodChange = changeManager.proposeChange(
      plan.id,
      'Use environment variable',
      'Secure credential handling',
      [issue.id],
      [
        {
          filePath: 'src/Secure.tsx',
          additions: 1,
          deletions: 1,
          originalContent: 'const apiKey = "live_123";',
          newContent: 'const apiKey = process.env.API_KEY;',
        },
      ]
    );

    await changeManager.applyChange(goodChange.id);
    const goodVerification = await verificationEngine.verifyChange(goodChange.id);

    expect(goodVerification.status).toBe('passed');
    expect(goodVerification.checks[0].status).toBe('passed');

    // Upon passed verification, the issue transitions to resolved!
    const resolvedIssue = registry.getIssue(issue.id)!;
    expect(resolvedIssue.status).toBe('resolved');
    expect(resolvedIssue.resolvedAt).toBeDefined();
    expect(changeManager.getChange(goodChange.id)!.status).toBe('verified');
  });
});
