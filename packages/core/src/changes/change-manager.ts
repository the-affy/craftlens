import * as fs from 'node:fs';
import * as path from 'node:path';
import { Change, ChangePlan, ChangeStatus, ChangeFile, ChangeFileEdit } from './change-model.js';
import { Issue } from '../types/issue.js';
import { IssueRegistry } from '../issue-registry/issue-registry.js';
import { UniversalFixValidator } from '../validation/universal-fix-validator.js';
import { ContextAwareFixGenerator } from '../recommendations/context-aware-fix-generator.js';

export interface ApplyValidationResult {
  valid: boolean;
  code?:
    | 'FILE_NOT_FOUND'
    | 'PATH_TRAVERSAL'
    | 'CONTENT_MODIFIED'
    | 'INVALID_RANGE'
    | 'NOT_APPROVED'
    | 'INVALID_PAYLOAD';
  message: string;
}

export class ChangeManager {
  private plans = new Map<string, ChangePlan>();
  private changes = new Map<string, Change>();
  private issueRegistry?: IssueRegistry;
  private workspaceRoot: string;

  constructor(
    rootOrRegistry: string | IssueRegistry = '/',
    registryOrRoot?: IssueRegistry | string
  ) {
    if (typeof rootOrRegistry === 'string') {
      this.workspaceRoot = rootOrRegistry;
      if (registryOrRoot && typeof registryOrRoot !== 'string') {
        this.issueRegistry = registryOrRoot;
      }
    } else {
      this.issueRegistry = rootOrRegistry;
      if (typeof registryOrRoot === 'string') {
        this.workspaceRoot = registryOrRoot;
      } else {
        this.workspaceRoot = '/';
      }
    }
  }

  public setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  public setIssueRegistry(registry: IssueRegistry): void {
    this.issueRegistry = registry;
  }

  public createPlan(
    title: string,
    summary: string,
    issuesOrIds: (Issue | string)[] = [],
    verificationStrategy = 'Run targeted rule checks on affected files after application'
  ): ChangePlan {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const linkedIssueIds: string[] = [];
    const resolvedIssues: Issue[] = [];

    if (Array.isArray(issuesOrIds)) {
      for (const item of issuesOrIds) {
        if (!item) continue;
        if (typeof item === 'string') {
          linkedIssueIds.push(item);
          const found = this.issueRegistry?.getIssue(item);
          if (found) resolvedIssues.push(found);
        } else if (typeof item === 'object' && item.id) {
          linkedIssueIds.push(item.id);
          resolvedIssues.push(item);
        }
      }
    }

    const affectedFiles = Array.from(
      new Set(
        resolvedIssues.flatMap(i => {
          if (!i || !Array.isArray(i.locations)) return [];
          return i.locations.map(l => l?.filePath).filter(Boolean);
        })
      )
    );

    const plan: ChangePlan = {
      id: planId,
      title,
      summary,
      linkedIssueIds,
      issueIds: linkedIssueIds,
      changeIds: [],
      affectedFiles,
      expectedOutcome: `Address ${linkedIssueIds.length} issue(s) across ${affectedFiles.length} file(s) while maintaining system integrity.`,
      verificationStrategy,
      status: 'proposed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.plans.set(planId, plan);

    // Update issues to 'planned'
    if (this.issueRegistry) {
      for (const id of linkedIssueIds) {
        const issue = this.issueRegistry.getIssue(id);
        if (issue && (issue.status === 'open' || !issue.status)) {
          this.issueRegistry.updateIssue(id, { status: 'planned' });
        }
        this.issueRegistry.linkChange(id, planId);
      }
    }

    return plan;
  }

  public proposeChange(
    planId: string,
    title: string,
    explanation: string,
    issueIds: string[],
    files: ChangeFile[]
  ): Change {
    const changeId = `change_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const change: Change = {
      id: changeId,
      issueIds,
      title,
      explanation,
      status: 'proposed',
      files,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.changes.set(changeId, change);

    const plan = this.plans.get(planId);
    if (plan) {
      if (!plan.changeIds.includes(changeId)) {
        plan.changeIds.push(changeId);
        plan.updatedAt = nowIso;
      }
    }

    if (this.issueRegistry) {
      for (const id of issueIds) {
        this.issueRegistry.linkChange(id, changeId);
        this.issueRegistry.updateIssue(id, { status: 'proposed' });
      }
    }

    return change;
  }

  public registerChange(change: Change): void {
    this.changes.set(change.id, change);
    if (this.issueRegistry && Array.isArray(change.issueIds)) {
      for (const id of change.issueIds) {
        this.issueRegistry.linkChange(id, change.id);
      }
    }
  }

  public getPlan(planId: string): ChangePlan | undefined {
    return this.plans.get(planId);
  }

  public getAllPlans(): ChangePlan[] {
    return Array.from(this.plans.values());
  }

  public getChange(changeId: string): Change | undefined {
    return this.changes.get(changeId);
  }

  public getAllChanges(): Change[] {
    return Array.from(this.changes.values());
  }

  public getPendingChanges(): Change[] {
    return Array.from(this.changes.values()).filter(
      c => c.status === 'proposed' || c.status === 'review' || c.status === 'approved'
    );
  }

  public approveChange(changeId: string): boolean {
    const change = this.changes.get(changeId);
    if (!change) return false;
    change.status = 'approved';
    change.updatedAt = new Date().toISOString();
    return true;
  }

  public rejectChange(changeId: string, reason?: string): boolean {
    const change = this.changes.get(changeId);
    if (!change) return false;
    change.status = 'rejected';
    change.rejectionReason = reason;
    change.updatedAt = new Date().toISOString();

    if (this.issueRegistry) {
      for (const id of change.issueIds) {
        const issue = this.issueRegistry.getIssue(id);
        if (issue && issue.status === 'proposed') {
          this.issueRegistry.updateIssue(id, { status: 'open' });
        }
      }
    }
    return true;
  }

  public getChangeForIssue(issueId: string): Change | undefined {
    if (!issueId) return undefined;
    for (const c of this.changes.values()) {
      if (c.issueIds.includes(issueId) && c.status !== 'rejected' && c.status !== 'reverted') {
        return c;
      }
    }
    return undefined;
  }

  public discardChange(changeId: string): boolean {
    const change = this.changes.get(changeId);
    if (!change) return false;
    change.status = 'rejected';
    change.updatedAt = new Date().toISOString();
    change.rejectionReason = 'Discarded by user';

    if (this.issueRegistry) {
      for (const id of change.issueIds) {
        const issue = this.issueRegistry.getIssue(id);
        if (issue && (issue.status === 'proposed' || issue.status === 'planned' || issue.status === 'review')) {
          this.issueRegistry.updateIssue(id, { status: 'open' });
        }
      }
    }
    return true;
  }

  public createOrGetProposedChangeForIssue(issueOrFinding: any): Change | undefined {
    if (!issueOrFinding) return undefined;
    const issueId = issueOrFinding.id || issueOrFinding.fingerprint;
    if (!issueId) return undefined;

    // Check if an active change already exists for this issue
    const existing = this.getChangeForIssue(issueId);
    if (existing) {
      return existing;
    }

    // Extract target file path
    const filePath =
      issueOrFinding.filePath ||
      (issueOrFinding.locations && issueOrFinding.locations[0]?.filePath) ||
      (issueOrFinding.location && issueOrFinding.location.filePath) ||
      (issueOrFinding.instances && issueOrFinding.instances[0]?.location?.filePath) ||
      '';

    if (!filePath) return undefined;

    const fullPath = path.resolve(this.workspaceRoot, filePath);
    let originalContent = '';
    try {
      if (fs.existsSync(fullPath)) {
        originalContent = fs.readFileSync(fullPath, 'utf-8');
      }
    } catch {
      return undefined;
    }

    const edits: ChangeFileEdit[] = [];
    const fixChanges = Array.isArray(issueOrFinding.fix?.changes) ? issueOrFinding.fix.changes : [];
    const designChanges = Array.isArray(issueOrFinding.designFix?.changes) ? issueOrFinding.designFix.changes : [];

    const issueLine =
      (issueOrFinding.locations && issueOrFinding.locations[0]?.range?.startLine) ||
      (issueOrFinding.location && ((issueOrFinding.location.range?.startLine) || issueOrFinding.location.line || issueOrFinding.location.start?.line)) ||
      1;
    const issueEndLine =
      (issueOrFinding.locations && issueOrFinding.locations[0]?.range?.endLine) ||
      (issueOrFinding.location && ((issueOrFinding.location.range?.endLine) || issueOrFinding.location.line || issueOrFinding.location.end?.line)) ||
      issueLine;

    if (fixChanges.length > 0) {
      for (const c of fixChanges) {
        const startL = c.range?.start?.line ?? c.range?.line ?? c.range?.startLine ?? issueLine;
        const startC = c.range?.start?.column ?? c.range?.column ?? c.range?.startColumn ?? 1;
        const endL = c.range?.end?.line ?? c.range?.endLine ?? startL;
        const endC = c.range?.end?.column ?? c.range?.endColumn ?? 1;
        edits.push({
          startLine: startL,
          startColumn: startC,
          endLine: endL,
          endColumn: endC,
          originalText: c.before,
          replacementText: c.newText ?? c.after ?? '',
        });
      }
    } else if (designChanges.length > 0) {
      for (const c of designChanges) {
        const startL = c.range?.start?.line ?? c.range?.line ?? c.range?.startLine ?? issueLine;
        const startC = c.range?.start?.column ?? c.range?.column ?? c.range?.startColumn ?? 1;
        const endL = c.range?.end?.line ?? c.range?.endLine ?? startL;
        const endC = c.range?.end?.column ?? c.range?.endColumn ?? 1;
        edits.push({
          startLine: startL,
          startColumn: startC,
          endLine: endL,
          endColumn: endC,
          originalText: c.before,
          replacementText: c.after ?? c.newText ?? '',
        });
      }
    } else {
      const suggestions = Array.isArray(issueOrFinding.suggestions)
        ? issueOrFinding.suggestions
        : ContextAwareFixGenerator.generateSuggestions(issueOrFinding, (this as any).projectContext);

      if (Array.isArray(suggestions) && suggestions.length > 0) {
        for (const s of suggestions) {
          if (s.replacement !== undefined || s.patch !== undefined) {
            const sRange = s.range || {};
            const locRange =
              (issueOrFinding.locations && issueOrFinding.locations[0]?.range) ||
              (issueOrFinding.location && (issueOrFinding.location.range || issueOrFinding.location));
            const startL = sRange.startLine || issueLine;
            const startC = sRange.startColumn || locRange?.startColumn || 1;
            const endL = sRange.endLine || issueEndLine;
            const endC = sRange.endColumn || locRange?.endColumn || 1;
            const replacementText = s.replacement ?? s.patch ?? '';
            let originalText = s.originalText ?? s.before;
            if (!originalText && originalContent) {
              const lines = originalContent.split('\n');
              const targetLine = lines[startL - 1];
              if (targetLine) {
                if (replacementText.startsWith('className=') && targetLine.includes('className=')) {
                  const match = targetLine.match(/className=(?:{[^}]+}|"[^"]*"|'[^']*')/);
                  if (match) originalText = match[0];
                } else if (replacementText.startsWith('style=') && targetLine.includes('style=')) {
                  const match = targetLine.match(/style=(?:{[^}]+}|"[^"]*"|'[^']*')/);
                  if (match) originalText = match[0];
                } else if (replacementText.startsWith('var(')) {
                  const match = targetLine.match(/#([0-9a-fA-F]{3,8})\b/);
                  if (match) originalText = match[0];
                }
              }
            }
            edits.push({
              startLine: startL,
              startColumn: startC,
              endLine: endL,
              endColumn: endC,
              originalText,
              replacementText,
            });
          }
        }
      } else if (Array.isArray(issueOrFinding.recommendations)) {
        for (const rec of issueOrFinding.recommendations) {
          if (Array.isArray(rec.proposedChanges)) {
            for (const pc of rec.proposedChanges) {
              if (pc.replacementSnippet !== undefined) {
                edits.push({
                  startLine: pc.startLine || issueLine,
                  startColumn: 1,
                  endLine: pc.endLine || issueEndLine,
                  endColumn: 1,
                  originalText: pc.originalSnippet,
                  replacementText: pc.replacementSnippet,
                });
              }
            }
          }
        }
      }
    }

    if (edits.length === 0) {
      return undefined;
    }

    // Compute new content by applying edits
    let newContent = originalContent;
    if (originalContent) {
      const lines = originalContent.split('\n');
      const sortedEdits = [...edits].sort((a, b) => b.startLine - a.startLine);
      for (const edit of sortedEdits) {
        const startIdx = Math.max(0, edit.startLine - 1);
        const endIdx = Math.max(startIdx, (edit.endLine || edit.startLine) - 1);
        if (edit.originalText && lines[startIdx]?.includes(edit.originalText)) {
          lines[startIdx] = lines[startIdx].replace(edit.originalText, edit.replacementText);
        } else if (
          edit.startLine === edit.endLine &&
          typeof edit.startColumn === 'number' &&
          typeof edit.endColumn === 'number' &&
          edit.startColumn > 1 &&
          edit.endColumn > edit.startColumn &&
          lines[startIdx]
        ) {
          const l = lines[startIdx];
          lines[startIdx] = l.slice(0, edit.startColumn - 1) + edit.replacementText + l.slice(edit.endColumn - 1);
        } else {
          lines.splice(startIdx, endIdx - startIdx + 1, edit.replacementText);
        }
      }
      newContent = lines.join('\n');
    }

    // Section 1: Pre-generation Safety Validation
    // Never propose an invalid or syntactically corrupt fix
    const syntaxCheck = UniversalFixValidator.validatePatch({
      id: 'pre_check',
      issueIds: [issueId],
      title: 'Pre-check',
      explanation: 'Pre-check',
      status: 'proposed',
      files: [{ filePath, additions: 1, deletions: 1, originalContent, newContent, edits }],
      createdAt: '',
      updatedAt: '',
    }, this.workspaceRoot);

    if (!syntaxCheck.valid) {
      // Per Principle 40: Never propose a fix that damages the project
      return undefined;
    }

    const origLinesCount = originalContent ? originalContent.split('\n').length : 0;
    const newLinesCount = newContent ? newContent.split('\n').length : 0;
    const additions = Math.max(edits.length, newLinesCount > origLinesCount ? newLinesCount - origLinesCount : 0);
    const deletions = Math.max(edits.length, origLinesCount > newLinesCount ? origLinesCount - newLinesCount : 0);

    const changeId = `change_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const title = `Fix: ${issueOrFinding.problemTitle || issueOrFinding.title || issueOrFinding.ruleId || 'Issue'}`;
    const explanation = issueOrFinding.whyItMatters || issueOrFinding.why || issueOrFinding.summary || 'Applies recommended fix to resolve the finding.';

    const change: Change = {
      id: changeId,
      issueIds: [issueId],
      title,
      explanation,
      status: 'proposed',
      files: [
        {
          filePath,
          additions,
          deletions,
          originalContent,
          newContent,
          edits,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.changes.set(changeId, change);

    if (this.issueRegistry) {
      this.issueRegistry.linkChange(issueId, changeId);
      this.issueRegistry.updateIssue(issueId, { status: 'proposed' });
    }

    return change;
  }

  /**
   * Section 17: Validates safety of a change before applying it.
   */
  public validateChangeForApply(change: Change): ApplyValidationResult {
    if (!change || !Array.isArray(change.files) || change.files.length === 0) {
      return {
        valid: false,
        code: 'INVALID_PAYLOAD',
        message: 'Unable to apply change: No modified files specified.',
      };
    }

    const normWorkspaceRoot = path.resolve(this.workspaceRoot);

    for (const file of change.files) {
      if (!file.filePath) {
        return {
          valid: false,
          code: 'FILE_NOT_FOUND',
          message: 'Unable to apply change: Missing target file path.',
        };
      }

      const resolvedPath = path.resolve(this.workspaceRoot, file.filePath);

      // 1. Path traversal check
      const relative = path.relative(normWorkspaceRoot, resolvedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return {
          valid: false,
          code: 'PATH_TRAVERSAL',
          message: `Security violation: Path traversal attempt. Target file path "${file.filePath}" attempts to traverse outside the workspace.`,
        };
      }

      // 2. Verify file exists
      if (!fs.existsSync(resolvedPath)) {
        return {
          valid: false,
          code: 'FILE_NOT_FOUND',
          message: `Unable to apply change: Target file "${file.filePath}" was not found on disk.`,
        };
      }

      // 3. Verify original content has not unexpectedly changed if originalContent was provided
      if (typeof file.originalContent === 'string') {
        try {
          const currentDiskContent = fs.readFileSync(resolvedPath, 'utf-8');
          // Check normalized whitespace to avoid line-ending discrepancies
          const normCurrent = currentDiskContent.replace(/\r\n/g, '\n');
          const normOriginal = file.originalContent.replace(/\r\n/g, '\n');

          if (normCurrent !== normOriginal) {
            return {
              valid: false,
              code: 'CONTENT_MODIFIED',
              message: `Unable to apply change: Target file "${file.filePath}" unexpectedly changed on disk after the change was proposed. Review the updated finding and generate a new proposal.`,
            };
          }
        } catch (err: any) {
          return {
            valid: false,
            code: 'FILE_NOT_FOUND',
            message: `Unable to read target file "${file.filePath}": ${err?.message || 'Read error'}`,
          };
        }
      }

      // 4. Validate edit bounds if edits provided
      if (Array.isArray(file.edits) && file.edits.length > 0) {
        try {
          const content = fs.readFileSync(resolvedPath, 'utf-8');
          const lines = content.split('\n');
          for (const edit of file.edits) {
            if (edit.startLine < 1 || edit.startLine > lines.length + 1) {
              return {
                valid: false,
                code: 'INVALID_RANGE',
                message: `Unable to apply change: Edit line ${edit.startLine} is out of bounds for "${file.filePath}" (${lines.length} lines).`,
              };
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // Universal Fix Validation Pipeline: Pre-apply patch validation (Section 1 & 16)
    const patchValidation = UniversalFixValidator.validatePatch(change, this.workspaceRoot);
    if (!patchValidation.valid) {
      const firstFailure = patchValidation.failures[0];
      return {
        valid: false,
        code: firstFailure.stage === 'stale_check' ? 'CONTENT_MODIFIED' : 'INVALID_PAYLOAD',
        message: `Validation failed (${firstFailure.stage}): ${firstFailure.message}${firstFailure.details ? ' Details: ' + firstFailure.details.join('; ') : ''}`,
      };
    }

    return { valid: true, message: 'Change is valid and safe to apply.' };
  }

  /**
   * Applies the approved change atomically.
   * If any file fails to write, all previous edits are rolled back.
   */
  public async applyChange(
    changeId: string
  ): Promise<{ success: boolean; error?: string; change?: Change }> {
    const change = this.changes.get(changeId);
    if (!change) {
      return { success: false, error: `Change "${changeId}" not found.` };
    }

    // Validate safety
    const validation = this.validateChangeForApply(change);
    if (!validation.valid) {
      change.status = 'failed';
      change.updatedAt = new Date().toISOString();
      change.verification = {
        status: 'failed',
        checks: [{ name: 'Pre-apply validation', status: 'failed', message: validation.message }],
        timestamp: new Date().toISOString(),
      };
      if (this.issueRegistry) {
        for (const id of change.issueIds) {
          this.issueRegistry.updateIssue(id, {
            status: 'open',
            verification: change.verification,
          });
        }
      }
      return { success: false, error: validation.message, change };
    }

    // Prepare backup snapshots for atomic rollback
    const backups = new Map<string, string>();
    const preparedWrites: { fullPath: string; newText: string }[] = [];

    try {
      for (const file of change.files) {
        const fullPath = path.resolve(this.workspaceRoot, file.filePath);
        const currentContent = fs.readFileSync(fullPath, 'utf-8');
        backups.set(fullPath, currentContent);

        let finalContent = file.newContent;
        if (!finalContent && Array.isArray(file.edits) && file.edits.length > 0) {
          const lines = currentContent.split('\n');
          // Apply edits in reverse line order to maintain indices
          const sortedEdits = [...file.edits].sort((a, b) => b.startLine - a.startLine);
          for (const edit of sortedEdits) {
            const startIdx = Math.max(0, edit.startLine - 1);
            const endIdx = Math.max(startIdx, (edit.endLine || edit.startLine) - 1);
            if (edit.originalText && lines[startIdx]?.includes(edit.originalText)) {
              lines[startIdx] = lines[startIdx].replace(edit.originalText, edit.replacementText);
            } else if (
              edit.startLine === edit.endLine &&
              typeof edit.startColumn === 'number' &&
              typeof edit.endColumn === 'number' &&
              edit.startColumn > 1 &&
              edit.endColumn > edit.startColumn &&
              lines[startIdx]
            ) {
              const l = lines[startIdx];
              lines[startIdx] = l.slice(0, edit.startColumn - 1) + edit.replacementText + l.slice(edit.endColumn - 1);
            } else {
              lines.splice(startIdx, endIdx - startIdx + 1, edit.replacementText);
            }
          }
          finalContent = lines.join('\n');
        }

        if (typeof finalContent !== 'string') {
          throw new Error(`No replacement content available for "${file.filePath}".`);
        }

        preparedWrites.push({ fullPath, newText: finalContent });
      }

      // Atomic commit: write all files
      for (const write of preparedWrites) {
        fs.writeFileSync(write.fullPath, write.newText, 'utf-8');
      }

      // Universal Fix Validation Pipeline: Post-Apply Validation (Section 1, 25, 26)
      const postApply = UniversalFixValidator.validateAppliedChange(change, backups, this.workspaceRoot);
      if (!postApply.valid) {
        // AUTOMATIC ROLLBACK: Restore original content across all modified files
        for (const [fullPath, original] of backups.entries()) {
          try {
            fs.writeFileSync(fullPath, original, 'utf-8');
          } catch {
            // ignore rollback error
          }
        }

        change.status = 'failed';
        change.updatedAt = new Date().toISOString();
        const failureDetails = postApply.failures.map(f => `[${f.stage}] ${f.message}${f.details ? ' (' + f.details.join(', ') + ')' : ''}`).join('; ');
        change.verification = {
          status: 'failed',
          checks: postApply.failures.map(f => ({
            name: `Validation: ${f.stage}`,
            status: 'failed',
            message: f.message,
          })),
          timestamp: new Date().toISOString(),
        };

        if (this.issueRegistry) {
          for (const id of change.issueIds) {
            this.issueRegistry.updateIssue(id, {
              status: 'open',
              verification: change.verification,
            });
          }
        }

        return {
          success: false,
          error: `Post-apply validation failed: ${failureDetails}. All modified files have been safely rolled back.`,
          change,
        };
      }

      // Update change status
      change.status = 'applied';
      change.updatedAt = new Date().toISOString();

      // Update linked issues
      if (this.issueRegistry) {
        for (const id of change.issueIds) {
          this.issueRegistry.updateIssue(id, {
            status: 'applied',
            verification: { status: 'pending', checks: [] },
          });
        }
      }

      return { success: true, change };
    } catch (err: any) {
      // Rollback any files that were written
      for (const [fullPath, original] of backups.entries()) {
        try {
          fs.writeFileSync(fullPath, original, 'utf-8');
        } catch {
          // ignore rollback write errors
        }
      }

      change.status = 'failed';
      change.updatedAt = new Date().toISOString();

      return {
        success: false,
        error: `Transaction failed during apply: ${err?.message || 'Unknown error'}. All changes have been safely rolled back.`,
        change,
      };
    }
  }

  /**
   * Reverts an applied change by restoring original contents.
   */
  public async revertChange(
    changeId: string
  ): Promise<{ success: boolean; error?: string }> {
    const change = this.changes.get(changeId);
    if (!change) {
      return { success: false, error: `Change "${changeId}" not found.` };
    }
    if (change.status !== 'applied' && change.status !== 'verified' && change.status !== 'failed') {
      return { success: false, error: `Cannot revert change in status "${change.status}".` };
    }

    try {
      for (const file of change.files) {
        if (typeof file.originalContent === 'string') {
          const fullPath = path.resolve(this.workspaceRoot, file.filePath);
          fs.writeFileSync(fullPath, file.originalContent, 'utf-8');
        }
      }

      change.status = 'reverted';
      change.updatedAt = new Date().toISOString();

      if (this.issueRegistry) {
        for (const id of change.issueIds) {
          this.issueRegistry.updateIssue(id, { status: 'open' });
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Revert failed: ${err?.message || 'Write error'}` };
    }
  }
}
