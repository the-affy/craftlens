import {
  Issue,
  IssueStatus,
  IssueCategory,
  IssueSeverity,
  VerificationState,
  issueToFinding,
  findingToIssue,
} from '../types/issue.js';
import { Finding, AuditState } from '../types/finding.js';
import { SkillVersion } from '../types/skill.js';
import { ScanScope, ReconcileResult, reconcileIssues } from './reconciliation.js';
import { normalizeIssueFilePath } from './fingerprint.js';

export interface IssueRegistryChangeEvent {
  type: 'reconcile' | 'update' | 'resolve' | 'dismiss' | 'clear';
  reconcileResult?: ReconcileResult;
  issue?: Issue;
  totalIssues: number;
  openIssues: number;
}

export class IssueRegistry {
  private issues = new Map<string, Issue>(); // keyed by issue.id
  private fingerprintToId = new Map<string, string>();
  private listeners: ((event: IssueRegistryChangeEvent) => void)[] = [];
  private workspaceRoot?: string;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot;
  }

  public setWorkspaceRoot(root?: string): void {
    this.workspaceRoot = root;
  }

  public getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }

  /**
   * Registers a single issue into the registry.
   */
  public registerIssue(issue: Issue): Issue {
    this.issues.set(issue.id, issue);
    if (issue.fingerprint) {
      this.fingerprintToId.set(issue.fingerprint, issue.id);
    }
    this.emitChange({
      type: 'update',
      issue,
      totalIssues: this.issues.size,
      openIssues: this.getOpenIssues().length,
    });
    return issue;
  }

  /**
   * Updates an existing issue in the registry.
   */
  public updateIssue(id: string, updates: Partial<Issue>): Issue | undefined {
    const existing = this.issues.get(id);
    if (!existing) return undefined;

    const updated: Issue = {
      ...existing,
      ...updates,
      id: existing.id, // prevent overwriting ID
      lastDetectedAt: updates.lastDetectedAt || existing.lastDetectedAt,
    };

    this.issues.set(id, updated);
    if (updated.fingerprint) {
      this.fingerprintToId.set(updated.fingerprint, id);
    }

    this.emitChange({
      type: 'update',
      issue: updated,
      totalIssues: this.issues.size,
      openIssues: this.getOpenIssues().length,
    });

    return updated;
  }

  public getIssue(id: string): Issue | undefined {
    if (!id) return undefined;
    return this.issues.get(id);
  }

  public getIssueById(id: string): Issue | undefined {
    return this.getIssue(id);
  }

  public getIssueByFingerprint(fingerprint: string): Issue | undefined {
    if (!fingerprint) return undefined;
    const id = this.fingerprintToId.get(fingerprint);
    if (id) {
      return this.issues.get(id);
    }
    for (const issue of this.issues.values()) {
      if (issue.fingerprint === fingerprint) return issue;
    }
    return undefined;
  }

  public getAllIssues(): Issue[] {
    return Array.from(this.issues.values());
  }

  public getOpenIssues(): Issue[] {
    return Array.from(this.issues.values()).filter(i =>
      i.status === 'open' ||
      i.status === 'planned' ||
      i.status === 'proposed' ||
      i.status === 'review' ||
      i.status === 'needs-revalidation'
    );
  }

  public getIssuesForFile(filePath: string): Issue[] {
    if (!filePath) return [];
    const norm = normalizeIssueFilePath(filePath, this.workspaceRoot);
    return Array.from(this.issues.values()).filter(i =>
      i.locations.some(l => normalizeIssueFilePath(l.filePath, this.workspaceRoot) === norm) ||
      (i.filePath && normalizeIssueFilePath(i.filePath, this.workspaceRoot) === norm)
    );
  }

  public getIssuesByStatus(status: IssueStatus): Issue[] {
    return Array.from(this.issues.values()).filter(i => i.status === status);
  }

  public getIssuesByCategory(category: IssueCategory): Issue[] {
    return Array.from(this.issues.values()).filter(i => i.category === category);
  }

  public getIssuesBySeverity(severity: IssueSeverity): Issue[] {
    return Array.from(this.issues.values()).filter(i => i.severity === severity);
  }

  public resolveIssue(id: string, reason?: string): boolean {
    const issue = this.issues.get(id);
    if (!issue) return false;

    issue.status = 'resolved';
    issue.resolvedAt = new Date().toISOString();
    if (reason && issue.verification) {
      issue.verification.checks.push({
        name: 'Manual / Resolution Note',
        status: 'passed',
        message: reason,
      });
    }

    this.emitChange({
      type: 'resolve',
      issue,
      totalIssues: this.issues.size,
      openIssues: this.getOpenIssues().length,
    });
    return true;
  }

  public dismissIssue(id: string, reason: string): boolean {
    const issue = this.issues.get(id);
    if (!issue) return false;

    issue.status = 'ignored';
    issue.dismissed = {
      reason,
      timestamp: new Date().toISOString(),
    };

    this.emitChange({
      type: 'dismiss',
      issue,
      totalIssues: this.issues.size,
      openIssues: this.getOpenIssues().length,
    });
    return true;
  }

  public linkChange(issueId: string, changeId: string): void {
    const issue = this.issues.get(issueId);
    if (issue) {
      if (!issue.changeIds.includes(changeId)) {
        issue.changeIds.push(changeId);
      }
      if (issue.status === 'open') {
        issue.status = 'planned';
      }
    }
  }

  public setVerification(issueId: string, verification: VerificationState): void {
    const issue = this.issues.get(issueId);
    if (issue) {
      issue.verification = verification;
      if (verification.status === 'passed') {
        issue.status = 'resolved';
        issue.resolvedAt = verification.timestamp || new Date().toISOString();
      } else if (verification.status === 'failed') {
        issue.status = 'open';
      } else if (verification.status === 'pending') {
        issue.status = 'verifying';
      }
      this.emitChange({
        type: 'update',
        issue,
        totalIssues: this.issues.size,
        openIssues: this.getOpenIssues().length,
      });
    }
  }

  /**
   * Reconciles incoming scan results with current registry issues.
   */
  public reconcile(scope: ScanScope, incoming: (Issue | Finding)[]): ReconcileResult {
    const existingList = Array.from(this.issues.values());
    const result = reconcileIssues(existingList, incoming, scope, this.workspaceRoot);

    // Rebuild internal map based on reconciled issues
    this.issues.clear();
    this.fingerprintToId.clear();

    for (const issue of result.allCurrent) {
      this.issues.set(issue.id, issue);
      if (issue.fingerprint) {
        this.fingerprintToId.set(issue.fingerprint, issue.id);
      }
    }

    this.emitChange({
      type: 'reconcile',
      reconcileResult: result,
      totalIssues: this.issues.size,
      openIssues: this.getOpenIssues().length,
    });

    return result;
  }

  public getCountsByStatus(): Record<IssueStatus, number> {
    const counts: Record<IssueStatus, number> = {
      'open': 0,
      'planned': 0,
      'proposed': 0,
      'review': 0,
      'applied': 0,
      'verifying': 0,
      'resolved': 0,
      'rejected': 0,
      'ignored': 0,
      'accepted-risk': 0,
      'needs-revalidation': 0,
    };
    for (const issue of this.issues.values()) {
      counts[issue.status] = (counts[issue.status] || 0) + 1;
    }
    return counts;
  }

  public getCountsByCategory(): Record<IssueCategory, number> {
    const counts: Record<IssueCategory, number> = {
      'ui': 0,
      'backend': 0,
      'security': 0,
      'performance': 0,
      'accessibility': 0,
      'quality': 0,
      'dependency': 0,
    };
    for (const issue of this.issues.values()) {
      counts[issue.category] = (counts[issue.category] || 0) + 1;
    }
    return counts;
  }

  public getCountsBySeverity(): Record<IssueSeverity, number> {
    const counts: Record<IssueSeverity, number> = {
      'critical': 0,
      'high': 0,
      'medium': 0,
      'low': 0,
      'suggestion': 0,
    };
    for (const issue of this.issues.values()) {
      counts[issue.severity] = (counts[issue.severity] || 0) + 1;
    }
    return counts;
  }

  public toFindings(): Finding[] {
    return Array.from(this.issues.values()).map(issueToFinding);
  }

  public exportAuditState(engineVersion: string = '2.0.0', skillVersions: SkillVersion[] = []): AuditState {
    const findings = this.toFindings();
    const openFindings = findings.filter(f => f.status !== 'fixed' && f.status !== 'ignored');
    const instances = findings.flatMap(f => f.instances && f.instances.length > 0 ? f.instances : []);

    const sevCounts = this.getCountsBySeverity();
    let score = 100;
    score -= sevCounts.critical * 25;
    score -= sevCounts.high * 8;
    score -= sevCounts.medium * 3;
    score -= sevCounts.low * 1;
    score = Math.max(0, Math.min(100, score));

    return {
      status: 'complete',
      findings: openFindings,
      instances,
      score: openFindings.length === 0 ? 100 : score,
      startedAt: Date.now(),
      completedAt: Date.now(),
      engineVersion,
      skillVersions,
    };
  }

  public clear(): void {
    this.issues.clear();
    this.fingerprintToId.clear();
    this.emitChange({
      type: 'clear',
      totalIssues: 0,
      openIssues: 0,
    });
  }

  public onDidChange(listener: (event: IssueRegistryChangeEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  private emitChange(event: IssueRegistryChangeEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        console.error('Error in IssueRegistry listener:', err);
      }
    }
  }
}
