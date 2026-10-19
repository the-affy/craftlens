import * as vscode from 'vscode';
import { MasterChecklist } from '@anti-slop/core';

export class AntiSlopStatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'antiSlop.openMasterChecklist';
    this.item.tooltip = 'Anti-Slop Continuous Quality Reviewer — Click to open Master Audit Checklist';
    this.updateIdle();
    this.item.show();
  }

  public updateIdle(): void {
    this.item.text = '$(shield) Anti-Slop: Ready';
    this.item.backgroundColor = undefined;
  }

  public updateReviewing(): void {
    this.item.text = '$(sync~spin) Anti-Slop: Reviewing changes...';
  }

  public updateFromChecklist(checklist: MasterChecklist): void {
    const summary = checklist.summary;
    const totalIssues = summary.errors + summary.warnings + summary.suggestions;

    if (summary.errors > 0) {
      this.item.text = `$(error) Anti-Slop: ${totalIssues} issue(s) (${summary.healthScore}%)`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (summary.warnings > 0) {
      this.item.text = `$(warning) Anti-Slop: ${totalIssues} issue(s) (${summary.healthScore}%)`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.text = `$(check) Anti-Slop: ${summary.healthScore}% Healthy`;
      this.item.backgroundColor = undefined;
    }

    this.item.tooltip = [
      `Anti-Slop Master Audit (${checklist.auditLevel.toUpperCase()})`,
      `Health Score: ${summary.healthScore}/100`,
      `Passed Requirements: ${summary.passed}/${summary.total}`,
      `Errors: ${summary.errors} | Warnings: ${summary.warnings} | Suggestions: ${summary.suggestions}`,
      'Click to view .antislop/checklist.md',
    ].join('\n');
  }

  public dispose(): void {
    this.item.dispose();
  }
}
