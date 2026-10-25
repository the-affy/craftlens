import * as vscode from 'vscode';
import { Finding } from '@craftlens/core';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';

export class CraftLensCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Empty,
  ];

  constructor(private diagnosticsAdapter: DiagnosticsCollectionAdapter) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const craftLensDiagnostics = context.diagnostics.filter(
      d => d.source === 'CraftLens'
    );

    if (craftLensDiagnostics.length === 0) {
      return actions;
    }

    const fileFindings = this.diagnosticsAdapter.getFindingsForFile(document.uri.fsPath);

    for (const diagnostic of craftLensDiagnostics) {
      const ruleId = typeof diagnostic.code === 'string' ? diagnostic.code : (diagnostic.code as any)?.value;
      if (!ruleId) continue;

      // Find the associated Finding
      const finding = fileFindings.find(f => {
        if (f.ruleId !== ruleId) return false;
        const fRange = mapLocationToVsCodeRange(f.location);
        return fRange.intersection(diagnostic.range) !== undefined;
      });

      if (!finding) continue;

      // 1. Safe or Assisted QuickFix (if fix exists)
      const hasFix = Boolean(
        (finding.fix && Array.isArray((finding.fix as any).changes) && (finding.fix as any).changes.length > 0) ||
        (finding.designFix && Array.isArray((finding.designFix as any).changes) && (finding.designFix as any).changes.length > 0)
      );

      const instanceCount = finding.instances?.length || 1;

      if (hasFix) {
        const title = finding.designFix?.title || finding.fix?.title || 'Apply fix';
        const fixAction = new vscode.CodeAction(
          `CraftLens: Apply Fix — ${title}`,
          vscode.CodeActionKind.QuickFix
        );
        fixAction.isPreferred = finding.designFix?.isPreferred ?? finding.fix?.isPreferred ?? (finding.fix?.kind === 'safe');
        fixAction.diagnostics = [diagnostic];

        const edit = new vscode.WorkspaceEdit();
        const changes = (finding.designFix?.changes || (finding.fix as any)?.changes || []) as any[];
        for (const change of changes) {
          const editRange = mapLocationToVsCodeRange(change.range);
          const newText = 'newText' in change ? (change as any).newText : (change as any).after;
          edit.replace(document.uri, editRange, newText);
        }
        fixAction.edit = edit;
        actions.push(fixAction);

        // 2. Preview Fix
        const previewAction = new vscode.CodeAction(
          `CraftLens: Preview Fix`,
          vscode.CodeActionKind.Empty
        );
        previewAction.command = {
          command: 'craftlens.previewDesignFix',
          title: 'Preview Fix',
          arguments: [document.uri, finding],
        };
        actions.push(previewAction);

        // 3. Fix All Instances (if multiple)
        if (instanceCount > 1) {
          const fixAllAction = new vscode.CodeAction(
            `CraftLens: Fix All ${instanceCount} Instances`,
            vscode.CodeActionKind.QuickFix
          );
          fixAllAction.command = {
            command: 'craftlens.fixAllInstances',
            title: `Fix All ${instanceCount} Instances`,
            arguments: [finding],
          };
          actions.push(fixAllAction);
        }
      }

      // Show All Instances
      if (instanceCount > 1) {
        const showAllAction = new vscode.CodeAction(
          `CraftLens: Show All ${instanceCount} Instances`,
          vscode.CodeActionKind.Empty
        );
        showAllAction.command = {
          command: 'craftlens.showFindingDetail',
          title: `Show All ${instanceCount} Instances`,
          arguments: [finding],
        };
        actions.push(showAllAction);
      }

      // 3. Reject Finding Action
      const rejectAction = new vscode.CodeAction(
        `CraftLens: Reject finding`,
        vscode.CodeActionKind.Empty
      );
      rejectAction.command = {
        command: 'craftlens.rejectFinding',
        title: 'Reject Finding',
        arguments: [finding],
      };
      actions.push(rejectAction);

      // 4. Suggest Better Design Action (when alternatives or design guidance exist)
      const hasAlternatives =
        (finding.alternatives && finding.alternatives.length > 0) ||
        (finding.structuredRecommendation?.alternatives && finding.structuredRecommendation.alternatives.length > 0) ||
        finding.supportedActions?.includes('suggest_better_design');

      if (hasAlternatives) {
        const designAction = new vscode.CodeAction(
          `CraftLens: Suggest Better Design`,
          vscode.CodeActionKind.Empty
        );
        designAction.command = {
          command: 'craftlens.suggestBetterDesign',
          title: 'Suggest Better Design',
          arguments: [finding, document.uri],
        };
        actions.push(designAction);
      }

      // 5. Explain Finding Code Action
      const explainAction = new vscode.CodeAction(
        `CraftLens: Explain finding`,
        vscode.CodeActionKind.Empty
      );
      explainAction.command = {
        command: 'craftlens.explainFinding',
        title: 'Explain Finding',
        arguments: [finding],
      };
      actions.push(explainAction);

      // 6. Not a Problem (Feedback & Suppression)
      const notAProblemAction = new vscode.CodeAction(
        `CraftLens: Mark as not a problem`,
        vscode.CodeActionKind.Empty
      );
      notAProblemAction.command = {
        command: 'craftlens.markNotAProblem',
        title: 'Not a Problem',
        arguments: [document.uri, finding],
      };
      actions.push(notAProblemAction);

      // 6. Ignore Line Suppression: // craftlens-disable-next-line <ruleId>
      const lineAction = new vscode.CodeAction(
        `CraftLens: Ignore '${ruleId}' on this line`,
        vscode.CodeActionKind.QuickFix
      );
      const lineEdit = new vscode.WorkspaceEdit();
      const lineIndex = Math.max(0, diagnostic.range.start.line);
      const lineObj = document.lineAt(lineIndex);
      const indent = lineObj.text.match(/^\s*/)?.[0] || '';
      lineEdit.insert(
        document.uri,
        new vscode.Position(lineIndex, 0),
        `${indent}// craftlens-disable-next-line ${ruleId}\n`
      );
      lineAction.edit = lineEdit;
      actions.push(lineAction);

      // 7. Ignore File Suppression: /* craftlens-disable-file <ruleId> */
      const fileAction = new vscode.CodeAction(
        `CraftLens: Disable '${ruleId}' for this entire file`,
        vscode.CodeActionKind.QuickFix
      );
      const fileEdit = new vscode.WorkspaceEdit();
      fileEdit.insert(
        document.uri,
        new vscode.Position(0, 0),
        `/* craftlens-disable-file ${ruleId} */\n`
      );
      fileAction.edit = fileEdit;
      actions.push(fileAction);

    }

    return actions;
  }
}
