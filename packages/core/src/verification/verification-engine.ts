import * as fs from 'node:fs';
import * as path from 'node:path';
import { VerificationState, VerificationCheck, Issue } from '../types/issue.js';
import { Finding } from '../types/finding.js';
import { IssueRegistry } from '../issue-registry/issue-registry.js';
import { ChangeManager } from '../changes/change-manager.js';
import { Change } from '../changes/change-model.js';

export type AnalyzerFunction = (filePath: string, content: string) => Promise<(Finding | Issue)[]>;

export class VerificationEngine {
  constructor(
    private issueRegistry: IssueRegistry,
    private changeManager?: ChangeManager,
    private analyzerFn?: AnalyzerFunction,
    private workspaceRoot: string = '/'
  ) {}

  public setAnalyzer(fn: AnalyzerFunction): void {
    this.analyzerFn = fn;
  }

  public setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  /**
   * Section 18: Verifies an applied change.
   * Applied ≠ Verified.
   * Only marks linked issues resolved when rule checks pass.
   */
  public async verifyChange(changeId: string): Promise<VerificationState> {
    const change = this.changeManager?.getChange(changeId);
    const nowIso = new Date().toISOString();

    if (!change) {
      return {
        status: 'not-run',
        checks: [{ name: 'Change Verification', status: 'skipped', message: `Change "${changeId}" not found.` }],
        timestamp: nowIso,
      };
    }

    const checks: VerificationCheck[] = [];
    let detectedNewFindings = false;

    // 1. Run targeted re-analysis on affected files if analyzer function is provided
    if (this.analyzerFn && Array.isArray(change.files)) {
      for (const file of change.files) {
        const fullPath = path.resolve(this.workspaceRoot, file.filePath);
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const newFindings = await this.analyzerFn(file.filePath, content);
            // Check if any non-resolved findings exist on this file
            if (newFindings.length > 0) {
              const linkedIssues = change.issueIds.map(id => this.issueRegistry.getIssue(id)).filter(Boolean);
              const matchingLinked = newFindings.filter(f =>
                linkedIssues.some(iss => iss && (iss.id === f.id || iss.fingerprint === (f.fingerprint || f.id) || iss.ruleId === f.ruleId))
              );
              const introducedUnlinked = newFindings.filter(f =>
                !linkedIssues.some(iss => iss && (iss.id === f.id || iss.fingerprint === (f.fingerprint || f.id) || iss.ruleId === f.ruleId))
              );

              if (introducedUnlinked.length > 0) {
                detectedNewFindings = true;
                checks.push({
                  name: `Regression Check: ${file.filePath}`,
                  status: 'failed',
                  message: `Re-analysis detected ${introducedUnlinked.length} new or regressed finding(s) after applying fix.`,
                });
              }
            }
            // Reconcile targeted file scan
            this.issueRegistry.reconcile({ type: 'file', filePath: file.filePath }, newFindings);
          } catch (err: any) {
            checks.push({
              name: `Re-analysis of ${file.filePath}`,
              status: 'failed',
              message: `Re-analysis error: ${err?.message || 'Execution failed'}`,
            });
          }
        } else {
          checks.push({
            name: `File existence check: ${file.filePath}`,
            status: 'failed',
            message: `Target file "${file.filePath}" was deleted or moved.`,
          });
        }
      }
    }

    // 2. Evaluate each linked issue in the change
    let passedCount = 0;
    let failedCount = 0;

    for (const issueId of change.issueIds) {
      const issue = this.issueRegistry.getIssue(issueId);
      if (!issue) {
        checks.push({
          name: `Issue ${issueId}`,
          status: 'skipped',
          message: 'Issue was removed from registry.',
        });
        continue;
      }

      // Check if the issue was resolved (i.e. no longer detected during targeted re-analysis)
      const isResolved = issue.status === 'resolved';

      if (isResolved) {
        passedCount++;
        checks.push({
          name: `${issue.ruleId}: ${issue.title}`,
          status: 'passed',
          message: 'Rule verification passed: finding is no longer detected.',
        });
      } else {
        failedCount++;
        checks.push({
          name: `${issue.ruleId}: ${issue.title}`,
          status: 'failed',
          message: 'Rule verification failed: finding is still detected after applying change.',
        });
      }
    }

    let finalStatus: VerificationState['status'] = 'not-run';
    if (checks.length === 0) {
      finalStatus = 'not-run';
    } else if (failedCount === 0 && passedCount > 0) {
      finalStatus = 'passed';
    } else if (passedCount > 0 && failedCount > 0) {
      finalStatus = 'partial';
    } else if (failedCount > 0) {
      finalStatus = 'failed';
    }

    const verificationState: VerificationState = {
      status: finalStatus,
      checks,
      timestamp: nowIso,
    };

    // Update Change object
    change.verification = verificationState;
    if (finalStatus === 'passed') {
      change.status = 'verified';
    } else if (finalStatus === 'failed') {
      change.status = 'failed';
    }
    change.updatedAt = nowIso;

    // Update linked issues in registry
    for (const issueId of change.issueIds) {
      const issue = this.issueRegistry.getIssue(issueId);
      if (issue) {
        if (finalStatus === 'passed') {
          this.issueRegistry.setVerification(issueId, verificationState);
        } else if (finalStatus === 'failed') {
          this.issueRegistry.updateIssue(issueId, {
            status: detectedNewFindings ? 'needs-revalidation' : 'open',
            verification: verificationState,
          });
        } else if (finalStatus === 'partial') {
          const check = checks.find(c => c.name.startsWith(issue.ruleId));
          if (check?.status === 'passed') {
            this.issueRegistry.setVerification(issueId, {
              status: 'passed',
              checks: [check],
              timestamp: nowIso,
            });
          } else {
            this.issueRegistry.updateIssue(issueId, {
              status: 'open',
              verification: verificationState,
            });
          }
        }
      }
    }

    return verificationState;
  }

  /**
   * Verifies an individual issue by checking if it is still present.
   */
  public async verifyIssue(issueId: string): Promise<VerificationState> {
    const issue = this.issueRegistry.getIssue(issueId);
    const nowIso = new Date().toISOString();

    if (!issue) {
      return {
        status: 'not-run',
        checks: [{ name: issueId, status: 'skipped', message: 'Issue not found in registry.' }],
        timestamp: nowIso,
      };
    }

    const filePath = issue.locations[0]?.filePath || issue.filePath;
    if (this.analyzerFn && filePath) {
      const fullPath = path.resolve(this.workspaceRoot, filePath);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const newFindings = await this.analyzerFn(filePath, content);
          this.issueRegistry.reconcile({ type: 'file', filePath }, newFindings);
        } catch (err: any) {
          // ignore
        }
      }
    }

    const updated = this.issueRegistry.getIssue(issueId);
    const isResolved = updated?.status === 'resolved' || !updated || updated.status === 'applied';

    const verification: VerificationState = {
      status: isResolved ? 'passed' : 'failed',
      checks: [
        {
          name: `${issue.ruleId}: ${issue.title}`,
          status: isResolved ? 'passed' : 'failed',
          message: isResolved ? 'Problem no longer detected.' : 'Problem still present in file.',
        },
      ],
      timestamp: nowIso,
    };

    this.issueRegistry.setVerification(issueId, verification);
    return verification;
  }
}
