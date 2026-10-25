import * as vscode from 'vscode';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../configuration/config-manager.js';

export class CraftLensCodeLensProvider implements vscode.CodeLensProvider {
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

      // 1. Lens title summarizing the finding (human title, no raw rule ID)
      const humanTitle = primary.problemTitle || primary.title || primary.whatIsWrong || primary.message;
      const titleLens = new vscode.CodeLens(range, {
        title: humanTitle,
        command: 'craftlens.openFindingLocation',
        arguments: [primary],
      });
      lenses.push(titleLens);

      // 2. Accept and Preview Fix if fix exists
      const fix = primary.designFix || primary.fix;
      if (fix && fix.changes && fix.changes.length > 0) {
        const fixTitle = fix.title ? `Accept: ${fix.title}` : 'Accept Fix';
        const acceptLens = new vscode.CodeLens(range, {
          title: fixTitle,
          command: 'craftlens.acceptFindingFix',
          arguments: [document.uri, primary],
        });
        lenses.push(acceptLens);

        const previewLens = new vscode.CodeLens(range, {
          title: 'Preview Diff',
          command: 'craftlens.previewDesignFix',
          arguments: [document.uri, primary],
        });
        lenses.push(previewLens);
      }

      // 3. Reject
      const rejectLens = new vscode.CodeLens(range, {
        title: 'Reject',
        command: 'craftlens.rejectFinding',
        arguments: [primary],
      });
      lenses.push(rejectLens);

      // 4. Action lens for Suggest Better Design
      const hasAlternatives = (primary.alternatives && primary.alternatives.length > 0) ||
        (primary.structuredRecommendation?.alternatives && primary.structuredRecommendation.alternatives.length > 0) ||
        primary.supportedActions?.includes('suggest_better_design');

      if (hasAlternatives) {
        const designLens = new vscode.CodeLens(range, {
          title: 'Suggest Better Design',
          command: 'craftlens.suggestBetterDesign',
          arguments: [primary, document.uri],
        });
        lenses.push(designLens);
      }
    }


    return lenses;
  }
}
