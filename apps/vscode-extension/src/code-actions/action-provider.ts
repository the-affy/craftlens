import * as vscode from 'vscode';
import { Finding } from '@anti-slop/core';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';

export class AntiSlopCodeActionProvider implements vscode.CodeActionProvider {
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
    const antiSlopDiagnostics = context.diagnostics.filter(d => d.source === 'Anti-Slop');

    if (antiSlopDiagnostics.length === 0) {
      return actions;
    }

    const fileFindings = this.diagnosticsAdapter.getFindingsForFile(document.uri.fsPath);

    for (const diagnostic of antiSlopDiagnostics) {
      const ruleId = typeof diagnostic.code === 'string' ? diagnostic.code : (diagnostic.code as any)?.value;
      if (!ruleId) continue;

      // Find the associated Finding
      const finding = fileFindings.find(f => {
        if (f.ruleId !== ruleId) return false;
        const fRange = mapLocationToVsCodeRange(f.location);
        return fRange.intersection(diagnostic.range) !== undefined;
      });

      if (!finding) continue;

      // 1. Safe or Assisted QuickFix
      if (finding.fix && finding.fix.changes.length > 0) {
        const fixAction = new vscode.CodeAction(
          `Anti-Slop: ${finding.fix.title}`,
          vscode.CodeActionKind.QuickFix
        );
        fixAction.isPreferred = finding.fix.isPreferred ?? (finding.fix.kind === 'safe');
        fixAction.diagnostics = [diagnostic];

        const edit = new vscode.WorkspaceEdit();
        for (const change of finding.fix.changes) {
          const editRange = mapLocationToVsCodeRange(change.range);
          edit.replace(document.uri, editRange, change.newText);
        }
        fixAction.edit = edit;
        actions.push(fixAction);
      }

      // 2. Explain Finding Code Action
      const explainAction = new vscode.CodeAction(
        `Anti-Slop: Explain finding (${ruleId})`,
        vscode.CodeActionKind.Empty
      );
      explainAction.command = {
        command: 'antiSlop.explainFinding',
        title: 'Explain Finding',
        arguments: [finding],
      };
      actions.push(explainAction);

      // 3. Ignore Line Suppression: // anti-slop-disable-next-line <ruleId>
      const lineAction = new vscode.CodeAction(
        `Anti-Slop: Ignore '${ruleId}' on this line`,
        vscode.CodeActionKind.QuickFix
      );
      const lineEdit = new vscode.WorkspaceEdit();
      const lineIndex = Math.max(0, diagnostic.range.start.line);
      const lineObj = document.lineAt(lineIndex);
      const indent = lineObj.text.match(/^\s*/)?.[0] || '';
      lineEdit.insert(
        document.uri,
        new vscode.Position(lineIndex, 0),
        `${indent}// anti-slop-disable-next-line ${ruleId}\n`
      );
      lineAction.edit = lineEdit;
      actions.push(lineAction);

      // 4. Ignore File Suppression: /* anti-slop-disable-file <ruleId> */
      const fileAction = new vscode.CodeAction(
        `Anti-Slop: Disable '${ruleId}' for this entire file`,
        vscode.CodeActionKind.QuickFix
      );
      const fileEdit = new vscode.WorkspaceEdit();
      fileEdit.insert(
        document.uri,
        new vscode.Position(0, 0),
        `/* anti-slop-disable-file ${ruleId} */\n`
      );
      fileAction.edit = fileEdit;
      actions.push(fileAction);
    }

    return actions;
  }
}
