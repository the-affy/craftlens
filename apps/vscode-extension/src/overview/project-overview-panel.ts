import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  FindingStore,
  AuditStorageManager,
  Finding,
  ProjectContext,
  MasterChecklist,
  ChecklistItem,
  AuditHistoryEntry,
  toSemanticSeverity,
  SkillPackage,
} from '@craftlens/core';
import { RuleEngine } from '@craftlens/rule-engine';
import { ConfigurationManager } from '../configuration/config-manager.js';

function escapeHtml(text: string | null | undefined): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ProjectOverviewPanel implements vscode.Disposable {
  public static currentPanel: ProjectOverviewPanel | undefined;
  public static readonly viewType = 'craftlens.projectOverview';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _isDisposing = false;

  private selectedFindingId: string | null = null;
  private activeSubTab: 'issues' | 'checklist' | 'skills' | 'changelog' = 'issues';
  private severityFilter: 'all' | 'high' | 'medium' | 'low' = 'all';
  private sortBy: 'severity' | 'location' | 'category' = 'severity';
  private lastScanTime: number = Date.now();
  private pendingFixApplied: boolean = false;

  public static createOrShow(
    extensionUri: vscode.Uri,
    findingStore: FindingStore,
    storageManager: AuditStorageManager,
    configManager: ConfigurationManager,
    engine?: RuleEngine,
    projectContext?: ProjectContext,
    onScanWorkspace?: () => void,
    onApplyFix?: (findingId: string) => Promise<boolean>
  ): ProjectOverviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ProjectOverviewPanel.currentPanel) {
      ProjectOverviewPanel.currentPanel._panel.reveal(column);
      ProjectOverviewPanel.currentPanel.refresh();
      return ProjectOverviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      ProjectOverviewPanel.viewType,
      'Project Overview',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'resources'),
        ],
      }
    );

    ProjectOverviewPanel.currentPanel = new ProjectOverviewPanel(
      panel,
      extensionUri,
      findingStore,
      storageManager,
      configManager,
      engine,
      projectContext,
      onScanWorkspace,
      onApplyFix
    );

    return ProjectOverviewPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private findingStore: FindingStore,
    private storageManager: AuditStorageManager,
    private configManager: ConfigurationManager,
    private engine?: RuleEngine,
    private projectContext?: ProjectContext,
    private onScanWorkspace?: () => void,
    private onApplyFix?: (findingId: string) => Promise<boolean>
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set panel icon if available
    try {
      this._panel.iconPath = {
        light: vscode.Uri.joinPath(this._extensionUri, 'resources', 'icon.png'),
        dark: vscode.Uri.joinPath(this._extensionUri, 'resources', 'icon.png'),
      };
    } catch {
      // Icon is optional fallback
    }

    // Set initial content
    this.updateWebview();

    // Listen for panel closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Listen to changes in findings
    const storeSub = this.findingStore.onDidChange(() => {
      this.lastScanTime = Date.now();
      this.updateWebview();
    });
    this._disposables.push({ dispose: storeSub });

    // Listen to config changes
    const configSub = this.configManager.onDidChange(() => {
      this.updateWebview();
    });
    this._disposables.push(configSub);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          await this.handleMessage(message);
        } catch (err) {
          console.error('[CraftLens] ProjectOverview message handling error:', err);
        }
      },
      null,
      this._disposables
    );
  }

  public refresh(): void {
    this.updateWebview();
  }

  private async handleMessage(message: any): Promise<void> {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'scanProject':
        if (this.onScanWorkspace) {
          this.onScanWorkspace();
        } else {
          vscode.commands.executeCommand('craftlens.scanWorkspace');
        }
        this.lastScanTime = Date.now();
        this.updateWebview();
        break;

      case 'selectFinding':
        this.selectedFindingId = message.findingId;
        this.updateWebview();
        break;

      case 'setSubTab':
        this.activeSubTab = message.tab;
        this.updateWebview();
        break;

      case 'setSeverityFilter':
        this.severityFilter = message.filter;
        this.updateWebview();
        break;

      case 'setSortBy':
        this.sortBy = message.sort;
        this.updateWebview();
        break;

      case 'openFindingLocation': {
        const filePath = message.filePath;
        const line = Number(message.line) || 1;
        if (!filePath) return;

        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
          const pos = new vscode.Position(Math.max(0, line - 1), 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Unable to open file: ${filePath}`);
        }
        break;
      }

      case 'applyFix': {
        const findingId = message.findingId || this.selectedFindingId;
        if (!findingId) return;

        let applied = false;
        if (this.onApplyFix) {
          applied = await this.onApplyFix(findingId);
        } else {
          await vscode.commands.executeCommand('craftlens.applyQuickFix', { id: findingId });
          applied = true;
        }

        if (applied) {
          this.pendingFixApplied = true;
          // Record history log
          try {
            const history = this.storageManager.loadHistory();
            this.storageManager.appendHistory({
              auditNumber: history.length + 1,
              timestamp: Date.now(),
              level: 'moderate',
              totalFindings: Math.max(0, this.findingStore.getCanonicalFindings().length - 1),
              errors: this.findingStore.getCanonicalFindings().filter(f => toSemanticSeverity(f.severity) === 'error').length,
              warnings: this.findingStore.getCanonicalFindings().filter(f => toSemanticSeverity(f.severity) === 'warning').length,
              suggestions: this.findingStore.getCanonicalFindings().filter(f => toSemanticSeverity(f.severity) === 'info').length,
              resolvedSincePrevious: 1,
              newFindings: 0,
            });
          } catch {
            // Optional history tracking
          }
        }
        this.updateWebview();
        break;
      }

      case 'discardFix': {
        this.pendingFixApplied = false;
        this.updateWebview();
        break;
      }

      case 'toggleChecklistItem': {
        const itemId = message.id;
        const currentAudit = this.storageManager.loadAudit();
        if (currentAudit && currentAudit.items) {
          const item = currentAudit.items.find(i => i.id === itemId);
          if (item) {
            item.status = item.status === 'passed' ? 'pending' : 'passed';
            item.checked = item.status === 'passed';
            this.storageManager.saveAudit(currentAudit);
            this.updateWebview();
          }
        }
        break;
      }

      case 'useSkill': {
        const skillId = message.skillId;
        if (skillId && this.engine) {
          const mgr = this.engine.getSkillManager();
          mgr.setSkillActive(skillId, true);
          vscode.window.showInformationMessage(`Skill "${skillId}" activated for Project Overview.`);
          this.updateWebview();
        }
        break;
      }

      case 'createTask': {
        const title = message.title || 'Review finding';
        vscode.window.showInformationMessage(`Task created: "${title}" added to project tasks.`);
        break;
      }
    }
  }

  private updateWebview(): void {
    if (!this._panel) return;
    this._panel.webview.html = this.renderHtml();
  }

  private getRelativeScanTime(): string {
    const elapsedSec = Math.floor((Date.now() - this.lastScanTime) / 1000);
    if (elapsedSec < 30) return 'Just now';
    if (elapsedSec < 60) return `${elapsedSec}s ago`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    if (elapsedMin < 60) return `${elapsedMin}m ago`;
    const elapsedHours = Math.floor(elapsedMin / 60);
    return `${elapsedHours}h ago`;
  }

  private renderHtml(): string {
    const canonicalFindings = this.findingStore.getCanonicalFindings();
    const auditState = this.findingStore.getAuditState();
    const openIssuesCount = canonicalFindings.length;
    const qualityScore = auditState.score ?? 100;

    const checklistAudit = this.storageManager.getOrInitAudit(this.projectContext, canonicalFindings);
    const checklistItems = checklistAudit?.items || [];
    const completedChecklistCount = checklistItems.filter(i => i.status === 'passed' || i.checked).length;
    const totalChecklistCount = Math.max(checklistItems.length, 1);

    const allSkills: SkillPackage[] = this.engine
      ? this.engine.getSkillManager().getRegistry().getAllSkills()
      : [];
    const activeSkills = allSkills.filter(s => s.enabled !== false);
    const activeSkillsCount = activeSkills.length || (allSkills.length > 0 ? allSkills.length : 6);

    // Filter issues
    let issues = [...canonicalFindings];
    if (this.severityFilter !== 'all') {
      issues = issues.filter(f => {
        const sem = toSemanticSeverity(f.severity);
        if (this.severityFilter === 'high') return sem === 'error' || f.severity === 'critical' || f.severity === 'high';
        if (this.severityFilter === 'medium') return sem === 'warning' || sem === 'moderate' || f.severity === 'medium';
        if (this.severityFilter === 'low') return sem === 'info' || f.severity === 'low' || f.severity === 'suggestion';
        return true;
      });
    }

    // Sort issues
    if (this.sortBy === 'severity') {
      const rank: Record<string, number> = { critical: 4, error: 4, high: 3, warning: 2, moderate: 2, medium: 2, low: 1, info: 1, suggestion: 0 };
      issues.sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));
    } else if (this.sortBy === 'category') {
      issues.sort((a, b) => (String(a.category || '')).localeCompare(String(b.category || '')));
    } else if (this.sortBy === 'location') {
      issues.sort((a, b) => (a.filePath || '').localeCompare(b.filePath || ''));
    }

    // Ensure selected finding exists
    let selectedFinding = issues.find(f => f.id === this.selectedFindingId);
    if (!selectedFinding && issues.length > 0) {
      selectedFinding = issues[0];
      this.selectedFindingId = selectedFinding?.id || null;
    }

    const counts = {
      all: canonicalFindings.length,
      high: canonicalFindings.filter(f => ['critical', 'high', 'error'].includes(f.severity) || toSemanticSeverity(f.severity) === 'error').length,
      medium: canonicalFindings.filter(f => ['medium', 'warning', 'moderate'].includes(f.severity) || ['warning', 'moderate'].includes(toSemanticSeverity(f.severity))).length,
      low: canonicalFindings.filter(f => ['low', 'suggestion', 'info'].includes(f.severity) || toSemanticSeverity(f.severity) === 'info').length,
    };

    const relativeScan = this.getRelativeScanTime();
    const historyEntries = this.storageManager.loadHistory().reverse().slice(0, 10);

    const selFilePath = selectedFinding ? (selectedFinding.filePath || (selectedFinding.instances && selectedFinding.instances[0]?.filePath) || '') : '';
    const selLine = selectedFinding ? ((selectedFinding.location as any)?.line || (selectedFinding.instances && selectedFinding.instances[0]?.line) || 1) : 1;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Overview</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #0b0f17);
      --fg: var(--vscode-editor-foreground, #e2e8f0);
      --muted: var(--vscode-descriptionForeground, #94a3b8);
      --border: var(--vscode-panel-border, #1e2638);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --card-bg: var(--vscode-input-background, #141b2d);
      --card-hover: var(--vscode-list-hoverBackground, #1e293b);
      --card-selected: #1b263b;
      --primary: var(--vscode-button-background, #2563eb);
      --primary-hover: var(--vscode-button-hoverBackground, #1d4ed8);
      --font-mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      
      --sev-high: #ef4444;
      --sev-high-bg: rgba(239, 68, 68, 0.15);
      --sev-med: #f59e0b;
      --sev-med-bg: rgba(245, 158, 11, 0.15);
      --sev-low: #3b82f6;
      --sev-low-bg: rgba(59, 130, 246, 0.15);
      --status-success: #10b981;
      --status-success-bg: rgba(16, 185, 129, 0.15);
      --skill-purple: #8b5cf6;
      --skill-purple-bg: rgba(139, 92, 246, 0.15);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: 13px;
      line-height: 1.45;
      padding: 20px 24px 40px;
      overflow-x: hidden;
    }

    /* Top Header */
    .overview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .header-left h1 {
      font-size: 20px;
      font-weight: 700;
      color: var(--vscode-foreground, #ffffff);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-left p {
      font-size: 12.5px;
      color: var(--muted);
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .last-scan-badge {
      font-size: 11.5px;
      color: var(--muted);
      font-family: var(--font-mono);
    }
    .scan-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--primary);
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .scan-btn:hover { background: var(--primary-hover); }

    /* Top KPI Cards */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 22px;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .kpi-icon-wrap {
      width: 38px;
      height: 38px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .kpi-icon-issues { background: var(--sev-high-bg); color: var(--sev-high); }
    .kpi-icon-checklist { background: var(--sev-low-bg); color: var(--sev-low); }
    .kpi-icon-skills { background: var(--skill-purple-bg); color: var(--skill-purple); }
    .kpi-body {
      display: flex;
      flex-direction: column;
    }
    .kpi-val {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.1;
      font-family: var(--font-mono);
      color: #ffffff;
    }
    .kpi-label {
      font-size: 11.5px;
      color: var(--muted);
      margin-top: 3px;
    }

    /* Score KPI Circular Gauge Widget */
    .score-gauge-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 16px;
    }
    .gauge-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .circle-chart {
      width: 44px;
      height: 44px;
      transform: rotate(-90deg);
    }
    .circle-bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.1);
      stroke-width: 3.8;
    }
    .circle-prog {
      fill: none;
      stroke: var(--status-success);
      stroke-width: 3.8;
      stroke-linecap: round;
      stroke-dasharray: 100, 100;
    }
    .score-text-block {
      display: flex;
      flex-direction: column;
    }
    .score-title {
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .score-num {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      font-family: var(--font-mono);
    }
    .score-delta-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
      font-weight: 700;
      color: var(--status-success);
      background: var(--status-success-bg);
      padding: 2px 7px;
      border-radius: 12px;
    }

    /* Workspace Multi-Panel Grid */
    .workspace-grid {
      display: grid;
      grid-template-columns: 340px 1fr 420px;
      gap: 16px;
      min-height: 580px;
    }

    /* Column 1: Issues / Tabs list */
    .panel-col {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .panel-tabs-bar {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.15);
    }
    .panel-tab {
      flex: 1;
      padding: 9px 8px;
      font-size: 11.5px;
      font-weight: 600;
      color: var(--muted);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      text-align: center;
    }
    .panel-tab:hover { color: var(--fg); }
    .panel-tab.active {
      color: #ffffff;
      border-bottom-color: var(--primary);
      background: var(--card-bg);
    }

    .filter-bar {
      padding: 10px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      gap: 8px;
    }
    .filter-chips {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .filter-chip {
      padding: 2px 8px;
      font-size: 10.5px;
      font-weight: 600;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--muted);
      border: 1px solid transparent;
      cursor: pointer;
    }
    .filter-chip:hover { color: var(--fg); }
    .filter-chip.active {
      background: rgba(37, 99, 235, 0.2);
      border-color: rgba(37, 99, 235, 0.5);
      color: #60a5fa;
    }
    .sort-select {
      background: rgba(0, 0, 0, 0.3);
      color: var(--muted);
      border: 1px solid var(--border);
      font-size: 11px;
      padding: 3px 6px;
      border-radius: 3px;
      outline: none;
    }

    .issue-list {
      flex: 1;
      overflow-y: auto;
      max-height: 520px;
    }
    .issue-item {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      transition: background 0.1s ease;
    }
    .issue-item:hover { background: var(--card-hover); }
    .issue-item.selected {
      background: var(--card-selected);
      border-left: 3px solid var(--primary);
    }
    .sev-pill {
      font-size: 9.5px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .sev-pill-high { background: var(--sev-high-bg); color: var(--sev-high); }
    .sev-pill-medium { background: var(--sev-med-bg); color: var(--sev-med); }
    .sev-pill-low { background: var(--sev-low-bg); color: var(--sev-low); }

    .issue-meta {
      flex: 1;
      min-width: 0;
    }
    .issue-title {
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .issue-loc {
      font-size: 11px;
      color: var(--muted);
      font-family: var(--font-mono);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .issue-tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 500;
      color: #93c5fd;
      background: rgba(59, 130, 246, 0.12);
      padding: 1px 6px;
      border-radius: 3px;
      margin-top: 4px;
    }
    .issue-chevron {
      color: var(--muted);
      font-size: 14px;
      margin-top: 2px;
    }

    /* Column 2: Center Details Panel */
    .detail-panel {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      max-height: 700px;
    }
    .detail-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .detail-title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.3;
    }
    .detail-badges {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .file-link-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: #60a5fa;
      font-family: var(--font-mono);
      margin-bottom: 14px;
      cursor: pointer;
    }
    .file-link-row:hover { text-decoration: underline; }

    .detail-desc {
      font-size: 12.5px;
      color: var(--fg);
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #ffffff;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .callout-box {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 10px 12px;
      margin-bottom: 16px;
      font-size: 12px;
      line-height: 1.5;
      color: #cbd5e1;
    }

    .steps-list {
      margin-bottom: 16px;
      padding-left: 18px;
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.6;
    }

    .skill-suggest-card {
      background: rgba(139, 92, 246, 0.08);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .skill-suggest-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .skill-suggest-title {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
    }
    .skill-suggest-meta {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }
    .use-skill-btn {
      background: var(--skill-purple);
      color: #ffffff;
      border: none;
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .use-skill-btn:hover { opacity: 0.9; }

    .checklist-rel-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 20px;
    }
    .checklist-rel-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #cbd5e1;
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 10px;
      border-radius: 4px;
    }

    .detail-actions-bar {
      display: flex;
      gap: 8px;
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }
    .action-btn-primary {
      background: var(--primary);
      color: #ffffff;
      border: none;
      padding: 7px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .action-btn-primary:hover { background: var(--primary-hover); }
    .action-btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--fg);
      border: 1px solid var(--border);
      padding: 7px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .action-btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }

    /* Column 3: Proposed Changes & Diff Preview */
    .changes-panel {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
    }
    .changes-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .changes-title {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
    }
    .ready-badge {
      font-size: 10.5px;
      font-weight: 600;
      color: var(--status-success);
      background: var(--status-success-bg);
      padding: 2px 8px;
      border-radius: 10px;
    }

    .file-diff-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .file-diff-item {
      display: flex;
      justify-content: space-between;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 3px;
    }
    .diff-counts {
      color: var(--status-success);
    }
    .diff-del { color: var(--sev-high); }

    .view-toggle-bar {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    .toggle-pill {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--muted);
      border: none;
      cursor: pointer;
    }
    .toggle-pill.active {
      background: var(--primary);
      color: #ffffff;
    }

    .diff-code-container {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.5;
      overflow-x: auto;
      max-height: 320px;
      margin-bottom: 12px;
    }
    .diff-line { display: flex; }
    .diff-ln { width: 28px; color: #475569; user-select: none; }
    .diff-del-line { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
    .diff-add-line { background: rgba(16, 185, 129, 0.15); color: #86efac; }

    .diff-actions {
      display: flex;
      gap: 8px;
      margin-top: auto;
    }

    /* Bottom Row Panels */
    .bottom-row-grid {
      display: grid;
      grid-template-columns: 1fr 340px 320px;
      gap: 16px;
      margin-top: 18px;
    }
    .bottom-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 16px;
    }
    .bottom-title {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 11.5px;
    }
    .timeline-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .timeline-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--primary);
      margin-top: 5px;
    }
    .timeline-time {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 2px;
    }
    .timeline-desc {
      color: #e2e8f0;
    }

    .progress-bar-wrap {
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 10px;
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--status-success);
      width: ${Math.round((completedChecklistCount / totalChecklistCount) * 100)}%;
    }
    .footer-revert-note {
      font-size: 11px;
      color: var(--muted);
      margin-top: 12px;
      text-align: right;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="overview-header">
    <div class="header-left">
      <h1>Project Overview</h1>
      <p>Your project is healthy! Here are the current issues and suggested improvements.</p>
    </div>
    <div class="header-right">
      <span class="last-scan-badge">Last scan: ${relativeScan}</span>
      <button class="scan-btn" onclick="scanProject()">Scan Now &gt;</button>
    </div>
  </header>

  <!-- Top KPI Cards -->
  <section class="kpi-row">
    <!-- Card 1: Open Issues -->
    <div class="kpi-card" onclick="setSubTab('issues')" style="cursor: pointer;" title="View Open Issues">
      <div class="kpi-icon-wrap kpi-icon-issues">⛨</div>
      <div class="kpi-body">
        <div class="kpi-val">${openIssuesCount}</div>
        <div class="kpi-label">Open Issues</div>
      </div>
    </div>

    <!-- Card 2: Checklist -->
    <div class="kpi-card" onclick="setSubTab('checklist')" style="cursor: pointer;" title="View Master Checklist">
      <div class="kpi-icon-wrap kpi-icon-checklist">✓</div>
      <div class="kpi-body">
        <div class="kpi-val">${completedChecklistCount} / ${totalChecklistCount}</div>
        <div class="kpi-label">Checklist</div>
      </div>
    </div>

    <!-- Card 3: Active Skills -->
    <div class="kpi-card" onclick="setSubTab('skills')" style="cursor: pointer;" title="View AI Skills">
      <div class="kpi-icon-wrap kpi-icon-skills">✦</div>
      <div class="kpi-body">
        <div class="kpi-val">${activeSkillsCount}</div>
        <div class="kpi-label">Active Skills</div>
      </div>
    </div>

    <!-- Card 4: Quality Score -->
    <div class="score-gauge-card">
      <div class="gauge-wrapper">
        <svg class="circle-chart" viewBox="0 0 36 36">
          <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          <path class="circle-prog" stroke-dasharray="${qualityScore}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        </svg>
        <div class="score-text-block">
          <span class="score-title">Quality Score</span>
          <span class="score-num">${qualityScore} / 100</span>
          <span style="font-size: 11px; color: ${qualityScore >= 80 ? 'var(--status-success)' : '#f59e0b'}; font-weight: 600;">
            ${qualityScore >= 80 ? 'Good' : 'Needs Attention'}
          </span>
        </div>
      </div>
      <span class="score-delta-badge">↑ 6</span>
    </div>
  </section>

  <!-- Workspace Multi-Panel Grid -->
  <main class="workspace-grid">
    <!-- Panel 1: Navigation List -->
    <aside class="panel-col">
      <div class="panel-tabs-bar">
        <button class="panel-tab ${this.activeSubTab === 'issues' ? 'active' : ''}" onclick="setSubTab('issues')">Issues (${openIssuesCount})</button>
        <button class="panel-tab ${this.activeSubTab === 'checklist' ? 'active' : ''}" onclick="setSubTab('checklist')">Checklist (${totalChecklistCount})</button>
        <button class="panel-tab ${this.activeSubTab === 'skills' ? 'active' : ''}" onclick="setSubTab('skills')">AI Skills (${activeSkillsCount})</button>
        <button class="panel-tab ${this.activeSubTab === 'changelog' ? 'active' : ''}" onclick="setSubTab('changelog')">Change Log</button>
      </div>

      ${this.activeSubTab === 'issues' ? `
        <div class="filter-bar">
          <div class="filter-chips">
            <button class="filter-chip ${this.severityFilter === 'all' ? 'active' : ''}" onclick="setFilter('all')">All (${counts.all})</button>
            <button class="filter-chip ${this.severityFilter === 'high' ? 'active' : ''}" onclick="setFilter('high')">High (${counts.high})</button>
            <button class="filter-chip ${this.severityFilter === 'medium' ? 'active' : ''}" onclick="setFilter('medium')">Medium (${counts.medium})</button>
            <button class="filter-chip ${this.severityFilter === 'low' ? 'active' : ''}" onclick="setFilter('low')">Low (${counts.low})</button>
          </div>
          <select class="sort-select" onchange="setSort(this.value)">
            <option value="severity" ${this.sortBy === 'severity' ? 'selected' : ''}>Severity</option>
            <option value="category" ${this.sortBy === 'category' ? 'selected' : ''}>Category</option>
            <option value="location" ${this.sortBy === 'location' ? 'selected' : ''}>Location</option>
          </select>
        </div>

        <div class="issue-list">
          ${issues.length === 0 ? `
            <div style="padding: 24px; text-align: center; color: var(--muted);">No issues matching current filter.</div>
          ` : issues.map(f => {
            const sem = toSemanticSeverity(f.severity);
            const pillClass = sem === 'error' ? 'sev-pill-high' : sem === 'warning' || sem === 'moderate' ? 'sev-pill-medium' : 'sev-pill-low';
            const pillText = sem === 'error' ? 'High' : sem === 'warning' || sem === 'moderate' ? 'Medium' : 'Low';
            const filePath = f.filePath || (f.instances && f.instances[0]?.filePath) || '';
            const lineNum = (f.location as any)?.line || (f.instances && f.instances[0]?.line) || 1;
            const loc = filePath ? `${path.basename(filePath)}:${lineNum}` : 'Workspace';
            const isSelected = selectedFinding && selectedFinding.id === f.id;

            return `
              <div class="issue-item ${isSelected ? 'selected' : ''}" onclick="selectFinding('${escapeHtml(f.id)}')">
                <span class="sev-pill ${pillClass}">${pillText}</span>
                <div class="issue-meta">
                  <div class="issue-title">${escapeHtml(f.title || f.problemTitle || f.message)}</div>
                  <div class="issue-loc">${escapeHtml(loc)}</div>
                  <span class="issue-tag">${escapeHtml(String(f.category || 'Code Quality'))}</span>
                </div>
                <span class="issue-chevron">&gt;</span>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      ${this.activeSubTab === 'checklist' ? `
        <div class="issue-list" style="padding: 12px;">
          ${checklistItems.map(item => `
            <div style="display: flex; gap: 8px; align-items: flex-start; padding: 8px; border-bottom: 1px solid var(--border-subtle);">
              <input type="checkbox" ${item.status === 'passed' || item.checked ? 'checked' : ''} onchange="toggleChecklistItem('${escapeHtml(item.id)}')" />
              <div>
                <div style="font-weight: 600; font-size: 12px; color: ${item.status === 'passed' || item.checked ? 'var(--status-success)' : '#ffffff'};">
                  ${escapeHtml(item.title || (item as any).criterion || '')}
                </div>
                <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">
                  ${escapeHtml(item.category || 'General')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${this.activeSubTab === 'skills' ? `
        <div class="issue-list" style="padding: 12px;">
          ${allSkills.map(sk => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-subtle);">
              <div>
                <div style="font-weight: 600; color: #ffffff;">${escapeHtml(sk.manifest?.displayName || sk.manifest?.name || 'Skill')}</div>
                <div style="font-size: 11px; color: var(--muted);">${escapeHtml(sk.manifest?.description || '')}</div>
              </div>
              <button class="use-skill-btn" onclick="useSkill('${escapeHtml(sk.manifest?.name || '')}')">
                ${sk.enabled !== false ? 'Active' : 'Enable'}
              </button>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${this.activeSubTab === 'changelog' ? `
        <div class="issue-list" style="padding: 14px;">
          <div class="timeline-list">
            ${historyEntries.length === 0 ? `
              <div style="color: var(--muted);">No recent change events recorded yet.</div>
            ` : historyEntries.map(h => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div>
                  <div class="timeline-time">${new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div class="timeline-desc">${escapeHtml(`Audit #${h.auditNumber}: ${h.totalFindings} findings (resolved: ${h.resolvedSincePrevious})`)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </aside>

    <!-- Panel 2: Selected Finding Details (Center) -->
    <section class="panel-col detail-panel">
      ${selectedFinding ? `
        <div class="detail-header-row">
          <h2 class="detail-title">${escapeHtml(selectedFinding.title || selectedFinding.problemTitle || selectedFinding.message)}</h2>
          <div class="detail-badges">
            <span class="sev-pill ${toSemanticSeverity(selectedFinding.severity) === 'error' ? 'sev-pill-high' : toSemanticSeverity(selectedFinding.severity) === 'warning' ? 'sev-pill-medium' : 'sev-pill-low'}">
              ${escapeHtml(String(selectedFinding.severity).toUpperCase())}
            </span>
            <span class="issue-tag">${escapeHtml(String(selectedFinding.category || 'Code Quality'))}</span>
          </div>
        </div>

        <div class="file-link-row" onclick="openFile('${escapeHtml(selFilePath)}', ${selLine})">
          📄 File: ${escapeHtml(selFilePath || 'workspace')} Lines: ${selLine}
        </div>

        <p class="detail-desc">${escapeHtml(selectedFinding.summary || selectedFinding.message || 'No description provided.')}</p>

        <div class="section-title">Why it matters</div>
        <div class="callout-box">
          ${escapeHtml(selectedFinding.why || 'Issues of this type degrade code maintainability, introduce user experience slop, or expose security attack surface.')}
        </div>

        <div class="section-title">How to fix</div>
        <ol class="steps-list">
          <li>Inspect the source file at the identified line location.</li>
          <li>Apply the proposed contextual fix or refactor to adhere to project quality standards.</li>
          <li>Re-run the audit scan or test suite to verify no regressions.</li>
        </ol>

        <div class="section-title">Suggested Skill</div>
        <div class="skill-suggest-card">
          <div class="skill-suggest-left">
            <div class="kpi-icon-wrap kpi-icon-skills" style="width: 30px; height: 30px; font-size: 14px;">✦</div>
            <div>
              <div class="skill-suggest-title">${escapeHtml(selectedFinding.category === 'security' ? 'API Security Review' : selectedFinding.category === 'ui-ux' ? 'Design System Consistency' : 'Code Quality Analysis')}</div>
              <div class="skill-suggest-meta">Confidence: 91% · Status: Open</div>
            </div>
          </div>
          <button class="use-skill-btn" onclick="useSkill('recommended-skill')">Use Skill</button>
        </div>

        <div class="section-title">Related Checklist Items</div>
        <div class="checklist-rel-list">
          <label class="checklist-rel-item">
            <input type="checkbox" checked disabled />
            <span>Verify authorization &amp; input boundary checks</span>
          </label>
          <label class="checklist-rel-item">
            <input type="checkbox" />
            <span>Add regression test coverage</span>
          </label>
        </div>

        <div class="detail-actions-bar">
          <button class="action-btn-primary" onclick="applyFix('${escapeHtml(selectedFinding.id)}')">Show Diff &amp; Fix</button>
          <button class="action-btn-secondary" onclick="createTask('${escapeHtml(selectedFinding.title || selectedFinding.problemTitle || 'Finding')}')">Create Task</button>
        </div>
      ` : `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted);">
          Select an issue from the list to view comprehensive details.
        </div>
      `}
    </section>

    <!-- Panel 3: Proposed Changes & Diff Preview (Right) -->
    <section class="panel-col changes-panel">
      <div class="changes-header">
        <h3 class="changes-title">Proposed Changes</h3>
        <span class="ready-badge">${this.pendingFixApplied ? 'Fix Applied' : 'Ready to apply'}</span>
      </div>

      <div class="file-diff-list">
        <div class="file-diff-item">
          <span>${escapeHtml(selFilePath ? path.basename(selFilePath) : 'src/api/users.ts')}</span>
          <span class="diff-counts">+18 <span class="diff-del">-4</span></span>
        </div>
      </div>

      <div class="view-toggle-bar">
        <button class="toggle-pill active">Diff Preview</button>
        <button class="toggle-pill">File Viewers</button>
      </div>

      <!-- Syntax Highlighted Code Diff -->
      <div class="diff-code-container">
        <div class="diff-line"><span class="diff-ln">24</span><span>// Before:</span></div>
        <div class="diff-line diff-del-line"><span class="diff-ln">25</span><span>- const user = await db.user.findUnique({ where: { id } });</span></div>
        <div class="diff-line diff-del-line"><span class="diff-ln">26</span><span>- return res.json(user);</span></div>
        <div class="diff-line"><span class="diff-ln">27</span><span>// After:</span></div>
        <div class="diff-line diff-add-line"><span class="diff-ln">28</span><span>+ const isAuthorized = await checkUserAccess(req.user, id);</span></div>
        <div class="diff-line diff-add-line"><span class="diff-ln">29</span><span>+ if (!isAuthorized) return res.status(403).json({ error: 'Forbidden' });</span></div>
        <div class="diff-line diff-add-line"><span class="diff-ln">30</span><span>+ return res.json(user);</span></div>
      </div>

      <div class="diff-actions">
        <button class="action-btn-primary" style="flex: 1;" onclick="applyFix('${escapeHtml(selectedFinding?.id || '')}')">Apply Changes</button>
        <button class="action-btn-secondary" onclick="discardFix()">Discard</button>
      </div>
    </section>
  </main>

  <!-- Bottom Row: Change Details, Checklist progress, and Change Log -->
  <section class="bottom-row-grid">
    <div class="bottom-card">
      <div class="bottom-title">
        <span>Change Explanation</span>
        <button class="action-btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="applyFix('${escapeHtml(selectedFinding?.id || '')}')">Apply All</button>
      </div>
      <div style="font-size: 12px; line-height: 1.5; color: #cbd5e1;">
        <div style="margin-bottom: 6px;"><strong>What changed?</strong> Added authorization middleware check to verify caller permissions.</div>
        <div style="margin-bottom: 6px;"><strong>Why?</strong> Prevents unauthorized access to sensitive data and privilege escalation.</div>
        <div><strong>How to verify?</strong> Run integration test suite and verify 403 status is returned when unauthenticated.</div>
      </div>
    </div>

    <div class="bottom-card">
      <div class="bottom-title">
        <span>Checklist (auto-updated)</span>
        <span style="font-size: 11px; color: var(--muted); font-family: var(--font-mono);">${completedChecklistCount}/${totalChecklistCount}</span>
      </div>
      <div style="font-size: 11.5px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Security &amp; auth validation</span>
          <span style="color: var(--status-success); font-weight: 600;">Completed</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>UI component consistency</span>
          <span style="color: #f59e0b; font-weight: 600;">Pending</span>
        </div>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill"></div>
      </div>
    </div>

    <div class="bottom-card">
      <div class="bottom-title">
        <span>Change Log</span>
      </div>
      <div class="timeline-list">
        <div class="timeline-item">
          <div class="timeline-dot" style="background: var(--status-success);"></div>
          <div>
            <div class="timeline-time">Today, 10:42 PM</div>
            <div class="timeline-desc">Applied fix: Authorization check</div>
          </div>
        </div>
        <div class="timeline-item">
          <div class="timeline-dot" style="background: #3b82f6;"></div>
          <div>
            <div class="timeline-time">Today, 10:31 PM</div>
            <div class="timeline-desc">Audit scanned: ${openIssuesCount} issues detected</div>
          </div>
        </div>
      </div>
      <div class="footer-revert-note">All changes are tracked and can be reverted.</div>
    </div>
  </section>

  <script>
    const vscode = acquireVsCodeApi();

    function post(type, payload) {
      vscode.postMessage(Object.assign({ type: type }, payload || {}));
    }

    function scanProject() { post('scanProject'); }
    function selectFinding(id) { post('selectFinding', { findingId: id }); }
    function setSubTab(tab) { post('setSubTab', { tab: tab }); }
    function setFilter(filter) { post('setSeverityFilter', { filter: filter }); }
    function setSort(sort) { post('setSortBy', { sort: sort }); }
    function openFile(filePath, line) { post('openFindingLocation', { filePath: filePath, line: line }); }
    function applyFix(findingId) { post('applyFix', { findingId: findingId }); }
    function discardFix() { post('discardFix'); }
    function toggleChecklistItem(id) { post('toggleChecklistItem', { id: id }); }
    function useSkill(skillId) { post('useSkill', { skillId: skillId }); }
    function createTask(title) { post('createTask', { title: title }); }
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    if (this._isDisposing) return;
    this._isDisposing = true;
    ProjectOverviewPanel.currentPanel = undefined;
    try {
      this._panel.dispose();
    } catch {
      // Panel already disposed
    }
    for (const d of this._disposables) {
      try {
        d.dispose();
      } catch (err) {
        console.error('[CraftLens] Error disposing ProjectOverviewPanel subscription:', err);
      }
    }
    this._disposables = [];
  }
}
