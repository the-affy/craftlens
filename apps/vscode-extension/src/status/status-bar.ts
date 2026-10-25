import * as vscode from 'vscode';
import { MasterChecklist } from '@craftlens/core';

export class CraftLensStatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'craftlens.openMasterChecklist';
    this.item.tooltip = 'CraftLens Continuous Quality Reviewer — Click to open Master Audit Checklist';
    this.updateIdle();
    this.item.show();
  }

  public updateIdle(): void {
    this.item.text = '$(shield) CraftLens: Ready';
    this.item.backgroundColor = undefined;
  }

  public updateReviewing(): void {
    this.item.text = '$(sync~spin) CraftLens: Reviewing changes...';
  }

  public updateFromChecklist(checklist: MasterChecklist): void {
    const summary = checklist.summary;
    const totalIssues = summary.errors + summary.warnings + summary.suggestions;

    if (summary.errors > 0) {
      this.item.text = `$(error) CraftLens: ${totalIssues} issue(s) (${summary.healthScore}%)`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (summary.warnings > 0) {
      this.item.text = `$(warning) CraftLens: ${totalIssues} issue(s) (${summary.healthScore}%)`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.text = `$(check) CraftLens: ${summary.healthScore}% Healthy`;
      this.item.backgroundColor = undefined;
    }

    const auditLevel = typeof checklist?.auditLevel === 'string' && checklist.auditLevel.trim()
      ? checklist.auditLevel.trim().toUpperCase()
      : 'MODERATE';

    this.item.tooltip = [
      `CraftLens Master Audit (${auditLevel})`,
      `Health Score: ${summary.healthScore}/100`,
      `Passed Requirements: ${summary.passed}/${summary.total}`,
      `Errors: ${summary.errors} | Warnings: ${summary.warnings} | Suggestions: ${summary.suggestions}`,
      'Click to view Master Audit Checklist',
    ].join('\n');
  }

  public dispose(): void {
    this.item.dispose();
  }
}
