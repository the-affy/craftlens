import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Finding,
  CanonicalRecommendation,
  normalizeRecommendation,
  validateRecommendation,
  TRANSFORMATION_CAPABILITIES,
  normalizeFindingLocation,
  RecommendationTextEdit,
  FixMode,
  AuditStorageManager,
} from '@craftlens/core';
import { DiagnosticsCollectionAdapter } from '../diagnostics/collection-adapter.js';
import { CraftLensSidebarProvider } from '../sidebar/sidebar-provider.js';
import { CraftLensDetailViewProvider } from '../sidebar/detail-panel-provider.js';
import { CraftLensInlineDecorationManager } from '../decorations/inline-decorations.js';

export interface RecommendationApplyResult {
  success: boolean;
  code?:
    | 'SUCCESS'
    | 'NO_RECOMMENDATION'
    | 'INVALID_RECOMMENDATION'
    | 'MISSING_REQUIRED_INFO'
    | 'INVALID_TARGET'
    | 'INVALID_FIX'
    | 'UNKNOWN_TRANSFORMATION'
    | 'WORKSPACE_UNAVAILABLE'
    | 'FILE_UNAVAILABLE'
    | 'PATH_OUTSIDE_WORKSPACE'
    | 'STALE_RECOMMENDATION'
    | 'MANUAL_ONLY'
    | 'NO_FIX_AVAILABLE'
    | 'INVALID_EDITS'
    | 'APPLY_FAILED';
  message: string;
  recommendation?: CanonicalRecommendation;
  targetUri?: vscode.Uri;
  modifiedText?: string;
}

export interface PreparedFixResult {
  canExecute: boolean;
  mode: FixMode;
  recommendation: CanonicalRecommendation;
  targetUri: vscode.Uri;
  document: vscode.TextDocument;
  originalText: string;
  modifiedText: string;
  edits: RecommendationTextEdit[];
  reason?: string;
}

export class RecommendationApplier {
  constructor(
    private diagnosticsAdapter: DiagnosticsCollectionAdapter,
    private sidebarProvider?: CraftLensSidebarProvider,
    private detailPanelProvider?: CraftLensDetailViewProvider,
    private inlineDecorationManager?: CraftLensInlineDecorationManager,
    private outputChannel?: vscode.OutputChannel,
    private scanDocumentFn?: (doc: vscode.TextDocument) => void,
    private storageManager?: AuditStorageManager
  ) {}

  /**
   * Prepares and validates a recommendation and its code transformation.
   * Shared by both Preview and Apply to ensure absolute parity.
   */
  public async prepareRecommendationFix(
    finding: Finding | undefined,
    rawRec: any
  ): Promise<
    | { success: true; prepared: PreparedFixResult }
    | { success: false; code: RecommendationApplyResult['code']; message: string; recommendation?: CanonicalRecommendation }
  > {
    if (!finding) {
      return {
        success: false,
        code: 'NO_RECOMMENDATION',
        message: 'CraftLens: No finding selected for this recommendation.',
      };
    }

    // 1. Normalize and Validate Canonical Recommendation Contract
    const canonicalRec = normalizeRecommendation(rawRec, finding);
    const validation = validateRecommendation(canonicalRec);
    if (!validation.valid) {
      return {
        success: false,
        code: validation.code || 'INVALID_RECOMMENDATION',
        message: validation.message,
        recommendation: canonicalRec,
      };
    }

    // 2. Resolve and Validate Target File Path
    const targetFilePath = canonicalRec.target?.filePath || finding.filePath || normalizeFindingLocation(finding)?.filePath;
    if (!targetFilePath) {
      return {
        success: false,
        code: 'FILE_UNAVAILABLE',
        message: 'Location unavailable: This finding is no longer linked to a valid source file.',
        recommendation: canonicalRec,
      };
    }

    const pathValidation = this.validateWorkspaceFilePath(targetFilePath);
    if (!pathValidation.valid || !pathValidation.resolvedPath) {
      return {
        success: false,
        code: pathValidation.code || 'FILE_UNAVAILABLE',
        message: pathValidation.message,
        recommendation: canonicalRec,
      };
    }

    // 3. Open Document and Check Staleness
    const targetUri = vscode.Uri.file(pathValidation.resolvedPath);
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(targetUri);
    } catch (e) {
      return {
        success: false,
        code: 'FILE_UNAVAILABLE',
        message: `The target file is no longer available. Run the audit again to refresh this recommendation.`,
        recommendation: canonicalRec,
      };
    }

    const originalText = doc.getText();

    // 4. Determine Transformation Capability & Mode
    const transformation = canonicalRec.transformation?.toLowerCase();
    const capability = transformation ? TRANSFORMATION_CAPABILITIES[transformation] : undefined;

    // 5. Generate Edits / Concrete Transformation
    const edits = this.generateEditsForRecommendation(doc, originalText, finding, canonicalRec);

    if (!edits || edits.length === 0) {
      // Manual recommendation or non-executable transformation
      const isKnownManual = capability && !capability.canApplyAutomatically;
      const message = isKnownManual
        ? `CraftLens can explain this recommendation, but an automatic fix isn't available for it yet.`
        : `Automatic fix isn't available for this recommendation yet.`;

      return {
        success: true,
        prepared: {
          canExecute: false,
          mode: 'manual',
          recommendation: canonicalRec,
          targetUri,
          document: doc,
          originalText,
          modifiedText: originalText,
          edits: [],
          reason: message,
        },
      };
    }

    // 6. Check for Stale Target Location & Validate Edits
    const staleness = this.checkStaleness(doc, originalText, edits);
    if (staleness.isStale) {
      return {
        success: false,
        code: 'STALE_RECOMMENDATION',
        message: `This recommendation is no longer valid because the file changed. Run the audit again to refresh it.`,
        recommendation: canonicalRec,
      };
    }

    // 7. Validate all edits against document boundaries
    const editValidation = this.validateEdits(doc, edits);
    if (!editValidation.valid) {
      return {
        success: false,
        code: 'INVALID_EDITS',
        message: `Unable to apply recommendation: ${editValidation.message}`,
        recommendation: canonicalRec,
      };
    }

    // 8. Generate Modified Code
    const modifiedText = this.applyEditsToString(originalText, doc, edits);

    const fixMode: FixMode = canonicalRec.fix?.type === 'safe' ? 'safe' : 'assisted';

    return {
      success: true,
      prepared: {
        canExecute: true,
        mode: fixMode,
        recommendation: canonicalRec,
        targetUri,
        document: doc,
        originalText,
        modifiedText,
        edits,
      },
    };
  }

  /**
   * Previews a recommendation in a native VS Code diff.
   */
  public async previewRecommendation(
    previewProvider: { setPreview(uri: vscode.Uri, content: string): void },
    findingArg?: any,
    recArg?: any
  ): Promise<RecommendationApplyResult> {
    try {
      const res = await this.prepareRecommendationFix(findingArg, recArg);
      if (!res.success) {
        vscode.window.showInformationMessage(res.message);
        return { success: false, code: res.code, message: res.message, recommendation: res.recommendation };
      }

      const { prepared } = res;
      if (!prepared.canExecute) {
        // Manual recommendation: show guidance in details panel, do NOT show a fake identical diff
        vscode.window.showInformationMessage(`CraftLens: ${prepared.reason || 'Follow implementation guidance in Details panel.'}`);
        this.detailPanelProvider?.showBetterDesign(findingArg, [prepared.recommendation as any]);
        return {
          success: true,
          code: 'MANUAL_ONLY',
          message: prepared.reason || 'Manual review required.',
          recommendation: prepared.recommendation,
        };
      }

      const previewUri = vscode.Uri.parse(
        `craftlens-preview:${path.basename(prepared.targetUri.fsPath)}?rec=${prepared.recommendation.id}&t=${Date.now()}`
      );
      previewProvider.setPreview(previewUri, prepared.modifiedText);

      await vscode.commands.executeCommand(
        'vscode.diff',
        prepared.targetUri,
        previewUri,
        `CraftLens: Current ↔ Proposed: ${prepared.recommendation.title}`
      );

      const choice = await vscode.window.showInformationMessage(
        `CraftLens: Proposed design direction "${prepared.recommendation.title}".\n${prepared.recommendation.description}`,
        'Apply',
        'Reject'
      );

      if (choice === 'Apply') {
        return await this.applyRecommendation(findingArg, prepared.recommendation);
      } else if (choice === 'Reject') {
        await vscode.commands.executeCommand('craftlens.rejectFinding', findingArg);
      }

      return {
        success: true,
        code: 'SUCCESS',
        message: `Preview opened for "${prepared.recommendation.title}".`,
        recommendation: prepared.recommendation,
        targetUri: prepared.targetUri,
        modifiedText: prepared.modifiedText,
      };
    } catch (e: any) {
      const msg = `CraftLens: Failed to preview recommendation: ${e?.message || e}`;
      this.logDiagnostic('previewRecommendation error', e);
      vscode.window.showErrorMessage(msg);
      return {
        success: false,
        code: 'APPLY_FAILED',
        message: msg,
      };
    }
  }

  /**
   * Applies a recommendation safely with edit validation, document save, re-scan, and resolution check.
   */
  public async applyRecommendation(
    findingArg?: any,
    recArg?: any
  ): Promise<RecommendationApplyResult> {
    try {
      const res = await this.prepareRecommendationFix(findingArg, recArg);
      if (!res.success) {
        vscode.window.showInformationMessage(res.message);
        return { success: false, code: res.code, message: res.message, recommendation: res.recommendation };
      }

      const { prepared } = res;
      if (!prepared.canExecute) {
        vscode.window.showInformationMessage(
          `CraftLens: ${prepared.reason || 'Follow implementation guidance in Details panel.'}`
        );
        this.detailPanelProvider?.showBetterDesign(findingArg, [prepared.recommendation as any]);
        return {
          success: true,
          code: 'MANUAL_ONLY',
          message: prepared.reason || 'Manual review required.',
          recommendation: prepared.recommendation,
        };
      }

      // Build VS Code WorkspaceEdit
      const edit = new vscode.WorkspaceEdit();

      // If full text replacement from contextual pattern:
      if (prepared.edits.length === 1 && prepared.edits[0].startLine === 1 && prepared.edits[0].endLine >= prepared.document.lineCount) {
        const fullRange = new vscode.Range(
          prepared.document.positionAt(0),
          prepared.document.positionAt(prepared.originalText.length)
        );
        edit.replace(prepared.targetUri, fullRange, prepared.modifiedText);
      } else {
        // Individual discrete edits
        for (const e of prepared.edits) {
          const startLineIdx = Math.max(0, e.startLine - 1);
          const endLineIdx = Math.max(startLineIdx, e.endLine - 1);
          const startCol = Math.max(0, (e.startColumn || 1) - 1);
          const endCol = e.endColumn !== undefined ? Math.max(0, e.endColumn - 1) : prepared.document.lineAt(endLineIdx).text.length;
          const range = new vscode.Range(startLineIdx, startCol, endLineIdx, endCol);
          edit.replace(prepared.targetUri, range, e.newText);
        }
      }

      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        const errorMsg = 'CraftLens: Failed to apply edit to workspace document.';
        vscode.window.showErrorMessage(errorMsg);
        return {
          success: false,
          code: 'APPLY_FAILED',
          message: errorMsg,
          recommendation: prepared.recommendation,
        };
      }

      await prepared.document.save();

      // Re-scan after apply
      if (this.scanDocumentFn) {
        this.scanDocumentFn(prepared.document);
      }

      // Check if finding is resolved
      const findingId = findingArg?.id || findingArg?.fingerprint || findingArg?.ruleId;
      const store = this.diagnosticsAdapter.getFindingStore();
      const currentFindings = store.getFindingsForFile(prepared.targetUri.fsPath);
      const stillPresent = currentFindings.some(f => (f.id || f.fingerprint || f.ruleId) === findingId);

      if (!stillPresent) {
        if (findingArg && typeof findingArg === 'object') {
          findingArg.status = 'fixed';
        }
        vscode.window.showInformationMessage(
          `CraftLens: Applied and verified design direction "${prepared.recommendation.title}". Finding resolved.`
        );
      } else {
        vscode.window.showInformationMessage(
          `CraftLens: Applied design direction "${prepared.recommendation.title}".`
        );
      }

      // Automatically check corresponding checklist criterion upon successful fix
      const sm = this.storageManager || (this.sidebarProvider as any)?.getStorageManager?.();
      if (sm) {
        sm.markCriteriaCheckedForFinding(findingArg);
      }

      this.sidebarProvider?.refresh();
      this.inlineDecorationManager?.updateAllVisibleEditors();

      return {
        success: true,
        code: 'SUCCESS',
        message: `Applied "${prepared.recommendation.title}".`,
        recommendation: prepared.recommendation,
        targetUri: prepared.targetUri,
        modifiedText: prepared.modifiedText,
      };
    } catch (e: any) {
      const msg = `CraftLens: Failed to apply recommendation: ${e?.message || e}`;
      this.logDiagnostic('applyRecommendation error', e);
      vscode.window.showErrorMessage(msg);
      return {
        success: false,
        code: 'APPLY_FAILED',
        message: msg,
      };
    }
  }

  /**
   * Generates concrete text edits for a recommendation and finding.
   */
  private generateEditsForRecommendation(
    doc: vscode.TextDocument,
    originalText: string,
    finding: Finding,
    rec: CanonicalRecommendation
  ): RecommendationTextEdit[] {
    // A. Explicit Fix Edits
    if (rec.fix?.edits && rec.fix.edits.length > 0) {
      return rec.fix.edits;
    }

    // B. Proposed Changes on recommendation
    if (Array.isArray(rec.proposedChanges) && rec.proposedChanges.length > 0) {
      const edits: RecommendationTextEdit[] = [];
      for (const change of rec.proposedChanges) {
        if (change.originalSnippet && typeof change.replacementSnippet === 'string') {
          const snippetIdx = originalText.indexOf(change.originalSnippet);
          if (snippetIdx !== -1) {
            const startPos = doc.positionAt(snippetIdx);
            const endPos = doc.positionAt(snippetIdx + change.originalSnippet.length);
            edits.push({
              filePath: doc.uri.fsPath,
              startLine: startPos.line + 1,
              startColumn: startPos.character + 1,
              endLine: endPos.line + 1,
              endColumn: endPos.character + 1,
              originalText: change.originalSnippet,
              newText: change.replacementSnippet,
            });
          }
        }
      }
      if (edits.length > 0) return edits;
    }

    // C. Deterministic changes from FindingFix / DesignFix
    const rawFix = finding.designFix?.changes || (finding.fix as any)?.changes;
    if (Array.isArray(rawFix) && rawFix.length > 0) {
      const edits: RecommendationTextEdit[] = [];
      for (const change of rawFix) {
        if (change.originalSnippet && typeof change.replacementSnippet === 'string') {
          const idx = originalText.indexOf(change.originalSnippet);
          if (idx !== -1) {
            const startPos = doc.positionAt(idx);
            const endPos = doc.positionAt(idx + change.originalSnippet.length);
            edits.push({
              filePath: doc.uri.fsPath,
              startLine: startPos.line + 1,
              startColumn: startPos.character + 1,
              endLine: endPos.line + 1,
              endColumn: endPos.character + 1,
              originalText: change.originalSnippet,
              newText: change.replacementSnippet,
            });
          }
        } else if (change.range) {
          edits.push({
            filePath: change.file || doc.uri.fsPath,
            startLine: change.range.start?.line || 1,
            startColumn: change.range.start?.column || 1,
            endLine: change.range.end?.line || 1,
            endColumn: change.range.end?.column || 1,
            originalText: change.before,
            newText: change.after || change.newText || '',
          });
        }
      }
      if (edits.length > 0) return edits;
    }

    // D. Concrete contextual transformations for repeated card treatment / CP-007
    const isRepeatedCard =
      finding.ruleId === 'CP-007' ||
      /repeated card|service-box|card-heavy/i.test(finding.message || finding.title || '');

    if (isRepeatedCard && /service-box/.test(originalText)) {
      if (rec.transformation === 'hierarchize') {
        let count = 0;
        const modified = originalText.replace(/class=["']([^"']*service-box[^"']*)["']/g, (match, classes) => {
          count++;
          if (count === 1) {
            return `class="${classes} service-box-featured" style="border-width: 2px; font-weight: 600;"`;
          } else {
            return `class="${classes} service-box-secondary" style="border-style: dashed; opacity: 0.9;"`;
          }
        });
        if (modified !== originalText) {
          return [
            {
              filePath: doc.uri.fsPath,
              startLine: 1,
              startColumn: 1,
              endLine: doc.lineCount,
              endColumn: doc.lineAt(doc.lineCount - 1).text.length + 1,
              originalText,
              newText: modified,
            },
          ];
        }
      } else if (rec.transformation === 'distill') {
        const modified = originalText.replace(/class=["']([^"']*service-box[^"']*)["']/g, (match, classes) => {
          return `class="${classes} service-editorial" style="border: none; background: transparent; box-shadow: none; padding: 12px 0;"`;
        });
        if (modified !== originalText) {
          return [
            {
              filePath: doc.uri.fsPath,
              startLine: 1,
              startColumn: 1,
              endLine: doc.lineCount,
              endColumn: doc.lineAt(doc.lineCount - 1).text.length + 1,
              originalText,
              newText: modified,
            },
          ];
        }
      } else if (rec.transformation === 'differentiate') {
        let count = 0;
        const modified = originalText.replace(/class=["']([^"']*service-box[^"']*)["']/g, (match, classes) => {
          count++;
          if (count % 2 === 1) {
            return `class="${classes} service-actionable"`;
          } else {
            return `class="${classes} service-informational" style="background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.08);"`;
          }
        });
        if (modified !== originalText) {
          return [
            {
              filePath: doc.uri.fsPath,
              startLine: 1,
              startColumn: 1,
              endLine: doc.lineCount,
              endColumn: doc.lineAt(doc.lineCount - 1).text.length + 1,
              originalText,
              newText: modified,
            },
          ];
        }
      }
    }

    return [];
  }

  /**
   * Applies edits to document text to produce the modified string.
   */
  private applyEditsToString(originalText: string, doc: vscode.TextDocument, edits: RecommendationTextEdit[]): string {
    if (edits.length === 1 && edits[0].startLine === 1 && edits[0].endLine >= doc.lineCount) {
      return edits[0].newText;
    }

    // Sort edits descending by start offset to avoid coordinate shifts
    const mapped = edits.map(e => {
      const startLineIdx = Math.max(0, e.startLine - 1);
      const endLineIdx = Math.max(startLineIdx, e.endLine - 1);
      const startCol = Math.max(0, (e.startColumn || 1) - 1);
      const endCol = e.endColumn !== undefined ? Math.max(0, e.endColumn - 1) : doc.lineAt(endLineIdx).text.length;

      const startOffset = doc.offsetAt(new vscode.Position(startLineIdx, startCol));
      const endOffset = doc.offsetAt(new vscode.Position(endLineIdx, endCol));
      return { startOffset, endOffset, newText: e.newText };
    });

    mapped.sort((a, b) => b.startOffset - a.startOffset);

    let result = originalText;
    for (const edit of mapped) {
      result = result.substring(0, edit.startOffset) + edit.newText + result.substring(edit.endOffset);
    }
    return result;
  }

  /**
   * Validates target file path against workspace constraints and existence.
   */
  private validateWorkspaceFilePath(filePath: string): { valid: boolean; resolvedPath?: string; code?: RecommendationApplyResult['code']; message: string } {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return {
        valid: false,
        code: 'FILE_UNAVAILABLE',
        message: 'Location unavailable: Finding does not specify a valid file path.',
      };
    }

    const resolved = path.resolve(filePath);

    // Workspace Folder check
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return {
        valid: false,
        code: 'WORKSPACE_UNAVAILABLE',
        message: 'No active workspace folder found. Open a workspace to apply recommendations.',
      };
    }

    const insideWorkspace = folders.some(f => {
      const folderPath = path.resolve(f.uri.fsPath);
      const relative = path.relative(folderPath, resolved);
      return !relative.startsWith('..') && !path.isAbsolute(relative);
    });

    if (!insideWorkspace) {
      return {
        valid: false,
        code: 'PATH_OUTSIDE_WORKSPACE',
        message: 'Security validation: Target file path is outside the active workspace.',
      };
    }

    // File existence check
    try {
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return {
          valid: false,
          code: 'FILE_UNAVAILABLE',
          message: 'The target file is no longer available. Run the audit again to refresh this recommendation.',
        };
      }
    } catch {
      return {
        valid: false,
        code: 'FILE_UNAVAILABLE',
        message: 'The target file is no longer available. Run the audit again to refresh this recommendation.',
      };
    }

    return {
      valid: true,
      resolvedPath: resolved,
      message: 'Valid file path.',
    };
  }

  /**
   * Detects whether file content has changed or line bounds are stale.
   */
  private checkStaleness(
    doc: vscode.TextDocument,
    originalText: string,
    edits: RecommendationTextEdit[]
  ): { isStale: boolean; reason?: string } {
    for (const e of edits) {
      // 1. Line bounds check
      if (e.startLine < 1 || e.startLine > doc.lineCount) {
        return { isStale: true, reason: `Target line ${e.startLine} exceeds document lines (${doc.lineCount}).` };
      }
      if (e.endLine < e.startLine || e.endLine > doc.lineCount) {
        return { isStale: true, reason: `Target end line ${e.endLine} exceeds document lines.` };
      }

      // 2. Expected original text check
      if (e.originalText && typeof e.originalText === 'string') {
        const startLineIdx = e.startLine - 1;
        const endLineIdx = e.endLine - 1;
        const targetSection = doc.getText(
          new vscode.Range(
            new vscode.Position(startLineIdx, 0),
            new vscode.Position(endLineIdx, doc.lineAt(endLineIdx).text.length)
          )
        );

        if (!targetSection.includes(e.originalText) && !originalText.includes(e.originalText)) {
          return {
            isStale: true,
            reason: `Target code snippet no longer matches document content.`,
          };
        }
      }
    }

    return { isStale: false };
  }

  /**
   * Validates all proposed text edits before submitting to VS Code.
   */
  private validateEdits(
    doc: vscode.TextDocument,
    edits: RecommendationTextEdit[]
  ): { valid: boolean; message: string } {
    if (!edits || edits.length === 0) {
      return { valid: false, message: 'No edits to apply.' };
    }

    for (let i = 0; i < edits.length; i++) {
      const e = edits[i];
      if (typeof e.newText !== 'string') {
        return { valid: false, message: `Edit #${i + 1} has invalid replacement text.` };
      }
      if (e.startLine < 1 || e.startLine > doc.lineCount) {
        return { valid: false, message: `Edit #${i + 1} startLine ${e.startLine} is out of bounds.` };
      }
      if (e.endLine < e.startLine || e.endLine > doc.lineCount) {
        return { valid: false, message: `Edit #${i + 1} endLine ${e.endLine} is out of bounds.` };
      }
    }

    return { valid: true, message: 'All edits valid.' };
  }

  private logDiagnostic(header: string, details: any): void {
    if (!this.outputChannel) return;
    try {
      this.outputChannel.appendLine(`[CraftLens RecommendationApplier] ${header}:`);
      this.outputChannel.appendLine(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
    } catch {
      // Safe logging
    }
  }
}
