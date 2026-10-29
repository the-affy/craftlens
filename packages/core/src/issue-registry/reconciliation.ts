import {
  Issue,
  IssueStatus,
  findingToIssue,
  normalizeIssueLocation,
} from '../types/issue.js';
import { Finding } from '../types/finding.js';
import {
  computeStableIssueFingerprint,
  computeStructuralIssueFingerprint,
  normalizeIssueFilePath,
} from './fingerprint.js';

export type ScanScopeType = 'full' | 'file' | 'directory';

export interface ScanScope {
  type: ScanScopeType;
  filePath?: string;
  directoryPath?: string;
  isPartialScan?: boolean;
}

export interface ReconcileResult {
  scope: ScanScope;
  added: Issue[];
  updated: Issue[];
  unmodified: Issue[];
  resolved: Issue[];
  stale: Issue[];
  allCurrent: Issue[];
}

/**
 * Reconciles incoming scan findings with existing issues in the registry.
 * Preserves user lifecycle, prevents accidental cross-file deletion on single-file scans,
 * and tracks moved / line-shifted issues accurately.
 */
export function reconcileIssues(
  existingIssues: Issue[],
  incomingItems: (Issue | Finding)[],
  scope: ScanScope,
  workspaceRoot?: string
): ReconcileResult {
  const nowIso = new Date().toISOString();

  // 1. Normalize all incoming items to Issue objects with stable fingerprints
  const incomingIssues: Issue[] = incomingItems.map(item => {
    const issue = 'fingerprint' in item && 'locations' in item
      ? (item as Issue)
      : findingToIssue(item as Finding);

    if (!issue.fingerprint || issue.fingerprint.startsWith('UNKNOWN')) {
      issue.fingerprint = computeStableIssueFingerprint({
        ruleId: issue.ruleId,
        category: issue.category,
        filePath: issue.locations[0]?.filePath,
        symbol: issue.locations[0]?.symbol,
        evidence: issue.evidence,
        workspaceRoot,
      });
    }

    if (!issue.id) {
      issue.id = issue.fingerprint;
    }

    return issue;
  });

  const added: Issue[] = [];
  const updated: Issue[] = [];
  const unmodified: Issue[] = [];
  const resolved: Issue[] = [];
  const stale: Issue[] = [];

  // Filter existing issues into two sets: in-scope vs out-of-scope
  const inScopeExisting: Issue[] = [];
  const outOfScopeExisting: Issue[] = [];

  const normScopeFilePath = scope.filePath ? normalizeIssueFilePath(scope.filePath, workspaceRoot) : undefined;
  const normScopeDir = scope.directoryPath ? normalizeIssueFilePath(scope.directoryPath, workspaceRoot) : undefined;

  for (const ex of existingIssues) {
    if (scope.type === 'full') {
      inScopeExisting.push(ex);
    } else if (scope.type === 'file' && normScopeFilePath) {
      const isMatch = ex.locations.some(l => normalizeIssueFilePath(l.filePath, workspaceRoot) === normScopeFilePath)
        || normalizeIssueFilePath(ex.filePath, workspaceRoot) === normScopeFilePath;
      if (isMatch) {
        inScopeExisting.push(ex);
      } else {
        outOfScopeExisting.push(ex);
      }
    } else if (scope.type === 'directory' && normScopeDir) {
      const isMatch = ex.locations.some(l => normalizeIssueFilePath(l.filePath, workspaceRoot).startsWith(normScopeDir));
      if (isMatch) {
        inScopeExisting.push(ex);
      } else {
        outOfScopeExisting.push(ex);
      }
    } else {
      inScopeExisting.push(ex);
    }
  }

  // Index in-scope existing issues
  const existingByFingerprint = new Map<string, Issue>();
  const existingByStructural = new Map<string, Issue>();

  for (const ex of inScopeExisting) {
    existingByFingerprint.set(ex.fingerprint, ex);
    const structKey = computeStructuralIssueFingerprint({
      ruleId: ex.ruleId,
      category: ex.category,
      filePath: ex.locations[0]?.filePath,
      symbol: ex.locations[0]?.symbol,
      evidence: ex.evidence,
      workspaceRoot,
    });
    existingByStructural.set(structKey, ex);
  }

  const matchedExistingIds = new Set<string>();
  const reconciledInScope: Issue[] = [];

  // Process incoming issues
  for (const incoming of incomingIssues) {
    // 1. Exact fingerprint match
    let match = existingByFingerprint.get(incoming.fingerprint);

    // 2. Structural match (line shifted or minor context change)
    if (!match) {
      const structKey = computeStructuralIssueFingerprint({
        ruleId: incoming.ruleId,
        category: incoming.category,
        filePath: incoming.locations[0]?.filePath,
        symbol: incoming.locations[0]?.symbol,
        evidence: incoming.evidence,
        workspaceRoot,
      });
      match = existingByStructural.get(structKey);
    }

    if (match) {
      matchedExistingIds.add(match.id);

      // Check if line range or evidence changed
      const oldRange = match.locations[0]?.range;
      const newRange = incoming.locations[0]?.range;
      const rangeChanged = oldRange && newRange && (
        oldRange.startLine !== newRange.startLine ||
        oldRange.endLine !== newRange.endLine ||
        oldRange.startColumn !== newRange.startColumn ||
        oldRange.endColumn !== newRange.endColumn
      );

      // Preserve user-governed states (ignored, rejected, accepted-risk)
      const isUserDismissed = match.status === 'ignored' || match.status === 'rejected' || match.status === 'accepted-risk';
      let currentStatus: IssueStatus = match.status;

      if (!isUserDismissed) {
        if (match.status === 'needs-revalidation') {
          currentStatus = 'open';
        } else if (match.status === 'resolved') {
          // Re-appeared finding: reopen
          currentStatus = 'open';
        } else if (match.status === 'applied' || match.status === 'verifying') {
          // Finding is still detected after change was applied: verification failed / still open
          currentStatus = 'open';
        }
      }

      const mergedIssue: Issue = {
        ...match,
        title: incoming.title || match.title,
        summary: incoming.summary || match.summary,
        locations: incoming.locations.length > 0 ? incoming.locations : match.locations,
        evidence: incoming.evidence.length > 0 ? incoming.evidence : match.evidence,
        recommendation: incoming.recommendation || match.recommendation,
        whyItMatters: incoming.whyItMatters || match.whyItMatters,
        lastDetectedAt: nowIso,
        status: currentStatus,
        confidence: incoming.confidence,
        // Compatibility updates
        filePath: incoming.filePath || match.filePath,
        startLine: incoming.locations[0]?.range.startLine ?? match.startLine,
        endLine: incoming.locations[0]?.range.endLine ?? match.endLine,
        location: incoming.location || match.location,
        suggestions: (incoming.suggestions && incoming.suggestions.length > 0) ? incoming.suggestions : (match.suggestions && match.suggestions.length > 0 ? match.suggestions : []),
        recommendations: (incoming.recommendations && incoming.recommendations.length > 0) ? incoming.recommendations : (match.recommendations && match.recommendations.length > 0 ? match.recommendations : []),
        fix: incoming.fix || match.fix,
        designFix: incoming.designFix || (incoming as any).designFix || match.designFix || (match as any).designFix,
        autoFixAvailable: incoming.autoFixAvailable ?? match.autoFixAvailable ?? Boolean(incoming.fix || incoming.designFix || match.fix || match.designFix),
      };

      if (rangeChanged || match.status !== currentStatus) {
        updated.push(mergedIssue);
      } else {
        unmodified.push(mergedIssue);
      }

      reconciledInScope.push(mergedIssue);
    } else {
      // Genuinely new issue
      const newIssue: Issue = {
        ...incoming,
        status: incoming.status || 'open',
        firstDetectedAt: nowIso,
        lastDetectedAt: nowIso,
      };
      added.push(newIssue);
      reconciledInScope.push(newIssue);
    }
  }

  // Handle in-scope existing issues that were NOT detected in the new scan
  for (const ex of inScopeExisting) {
    if (!matchedExistingIds.has(ex.id)) {
      if (scope.isPartialScan) {
        // In a partial scan, do not delete; mark as needs-revalidation
        const staleIssue: Issue = {
          ...ex,
          status: 'needs-revalidation',
        };
        stale.push(staleIssue);
        reconciledInScope.push(staleIssue);
      } else {
        // Disappeared from a clean full/file scan
        if (ex.status === 'applied' || ex.status === 'verifying') {
          // Applied fix resolved the issue!
          const resolvedIssue: Issue = {
            ...ex,
            status: 'resolved',
            resolvedAt: nowIso,
          };
          resolved.push(resolvedIssue);
          reconciledInScope.push(resolvedIssue);
        } else if (ex.status === 'open') {
          // Developer fixed it or removed offending code
          const resolvedIssue: Issue = {
            ...ex,
            status: 'resolved',
            resolvedAt: nowIso,
          };
          resolved.push(resolvedIssue);
          reconciledInScope.push(resolvedIssue);
        } else {
          // Keep dismissed or other statuses
          reconciledInScope.push(ex);
        }
      }
    }
  }

  // All current issues = untouched out-of-scope issues + reconciled in-scope issues
  const allCurrent = [...outOfScopeExisting, ...reconciledInScope];

  return {
    scope,
    added,
    updated,
    unmodified,
    resolved,
    stale,
    allCurrent,
  };
}
