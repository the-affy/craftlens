import * as vscode from 'vscode';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../configuration/config-manager.js';

export class AntiSlopCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  constructor(
    private diagnosticsAdapter: DiagnosticsCollectionAdapter,
    private configManager: ConfigurationManager
  ) {}

  public refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const config = this.configManager.getConfig();
    if (!config.enabled || !config.enableCodeLens) {
      return [];
    }

    const fileFindings = this.diagnosticsAdapter.getFindingsForFile(document.uri.fsPath);
    if (fileFindings.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];

    // Group findings by start line to avoid lens stacking clutter
    const byLine = new Map<number, typeof fileFindings>();
    for (const f of fileFindings) {
      const line = Math.max(0, f.location.start.line - 1);
      const list = byLine.get(line) || [];
      list.push(f);
      byLine.set(line, list);
    }

    for (const [line, findings] of byLine.entries()) {
      const primary = findings[0];
      const range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0));
      const icon = primary.severity === 'error' || primary.severity === 'blocker' ? '$(error)' : '$(warning)';

      // 1. Lens title summarizing the finding
      const titleLens = new vscode.CodeLens(range, {
        title: `${icon} ${primary.ruleId}: ${primary.message}`,
        command: 'antiSlop.explainFinding',
        arguments: [primary],
      });
      lenses.push(titleLens);

      // 2. Action lens for Quick Fix if available
      if (primary.fix) {
        const fixLens = new vscode.CodeLens(range, {
          title: `Fix: ${primary.fix.title}`,
          command: 'antiSlop.applyQuickFix',
          arguments: [document.uri, primary],
        });
        lenses.push(fixLens);
      }
    }

    return lenses;
  }
}
