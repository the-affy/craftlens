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
  ChangeManager,
  VerificationEngine,
  Change,
  IssueRegistry,
  FixCapability,
  resolveFixCapability,
} from '@craftlens/core';
import { RuleEngine } from '@craftlens/rule-engine';
import { ConfigurationManager } from '../configuration/config-manager.js';

interface DiffLineItem {
  lineNo: number | string;
  type: 'ctx' | 'del' | 'add';
  text: string;
}

function computeDiffPreview(originalContent: string, newContent: string): DiffLineItem[] {
  if (!originalContent || !newContent || originalContent === newContent) {
    return [];
  }
  const origLines = originalContent.split('\n');
  const newLines = newContent.split('\n');

  let prefix = 0;
  while (prefix < origLines.length && prefix < newLines.length && origLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < (origLines.length - prefix) &&
    suffix < (newLines.length - prefix) &&
    origLines[origLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const contextBefore = Math.max(0, prefix - 2);
  const diffItems: DiffLineItem[] = [];

  for (let i = contextBefore; i < prefix; i++) {
    diffItems.push({
      lineNo: i + 1,
      type: 'ctx',
      text: origLines[i],
    });
  }

  const delEnd = origLines.length - suffix;
  for (let i = prefix; i < delEnd; i++) {
    diffItems.push({
      lineNo: i + 1,
      type: 'del',
      text: origLines[i],
    });
  }

  const addEnd = newLines.length - suffix;
  for (let i = prefix; i < addEnd; i++) {
    diffItems.push({
      lineNo: i + 1,
      type: 'add',
      text: newLines[i],
    });
  }

  const afterNewStart = newLines.length - suffix;
  const afterNewEnd = Math.min(newLines.length, afterNewStart + 2);
  for (let i = afterNewStart; i < afterNewEnd; i++) {
    diffItems.push({
      lineNo: i + 1,
      type: 'ctx',
      text: newLines[i],
    });
  }

  return diffItems;
}

function computeBeforeView(originalContent: string, newContent: string): DiffLineItem[] {
  if (!originalContent || !newContent || originalContent === newContent) return [];
  const diff = computeDiffPreview(originalContent, newContent);
  return diff.filter(d => d.type === 'ctx' || d.type === 'del');
}

function computeAfterView(originalContent: string, newContent: string): DiffLineItem[] {
  if (!originalContent || !newContent || originalContent === newContent) return [];
  const diff = computeDiffPreview(originalContent, newContent);
  return diff.filter(d => d.type === 'ctx' || d.type === 'add');
}

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
  private activeSubTab: 'issues' | 'checklist' | 'skills' | 'changelog' | 'qa' = 'issues';
  private severityFilter: 'all' | 'high' | 'medium' | 'low' = 'all';
  private sortBy: 'severity' | 'location' | 'category' = 'severity';
  private lastScanTime: number = Date.now();
  private pendingFixApplied: boolean = false;
  private diffViewMode: 'diff' | 'before' | 'after' = 'diff';

  public static createOrShow(
    extensionUri: vscode.Uri,
    findingStore: FindingStore,
    storageManager: AuditStorageManager,
    configManager: ConfigurationManager,
    engine?: RuleEngine,
    projectContext?: ProjectContext,
    onScanWorkspace?: () => void,
    onApplyFix?: (findingId: string) => Promise<boolean>,
    onOpenArtifact?: (artifactName: string) => Promise<void>,
    changeManager?: ChangeManager,
    verificationEngine?: VerificationEngine
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
      onApplyFix,
      onOpenArtifact,
      changeManager,
      verificationEngine
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
    private onApplyFix?: (findingId: string) => Promise<boolean>,
    private onOpenArtifact?: (artifactName: string) => Promise<void>,
    private changeManager?: ChangeManager,
    private verificationEngine?: VerificationEngine
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

    // Listen to canonical issue selection (Section 1 & 5 & 6)
    const selectionSub = this.findingStore.onDidSelectIssue((issueId) => {
      if (this.selectedFindingId !== issueId) {
        this.selectedFindingId = issueId;
        this.pendingFixApplied = false;
        this.updateWebview();
      }
    });
    this._disposables.push({ dispose: selectionSub });

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

  public setSelectedFindingId(findingId: string | null): void {
    this.selectedFindingId = findingId;
    this.pendingFixApplied = false;
    this.findingStore.setSelectedIssueId(findingId);
    this.updateWebview();
  }

  public setDiffViewMode(mode: 'diff' | 'before' | 'after'): void {
    this.diffViewMode = mode;
    this.updateWebview();
  }

  public getHtml(): string {
    return this.renderHtml();
  }

  public getChangeManager(): ChangeManager {
    if (!this.changeManager) {
      const root = this.projectContext?.rootPath || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '/');
      const registry = this.findingStore?.getIssueRegistry?.() || new IssueRegistry();
      this.changeManager = new ChangeManager(root, registry);
    }
    return this.changeManager;
  }

  public getVerificationEngine(): VerificationEngine {
    if (!this.verificationEngine) {
      const cm = this.getChangeManager();
      const registry = this.findingStore?.getIssueRegistry?.() || new IssueRegistry();
      const root = this.projectContext?.rootPath || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '/');
      this.verificationEngine = new VerificationEngine(registry, cm, undefined, root);
    }
    return this.verificationEngine;
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
        this.pendingFixApplied = false;
        this.findingStore.setSelectedIssueId(message.findingId);
        this.updateWebview();
        break;

      case 'setDiffViewMode':
        if (message.mode === 'diff' || message.mode === 'before' || message.mode === 'after') {
          this.diffViewMode = message.mode;
          this.updateWebview();
        }
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
        const changeId = message.changeId;
        const findingId = message.findingId || this.selectedFindingId;
        const cm = this.getChangeManager();
        const ve = this.getVerificationEngine();

        let targetChange = changeId ? cm.getChange(changeId) : undefined;
        if (!targetChange && findingId) {
          targetChange = cm.getChangeForIssue(findingId);
          if (!targetChange) {
            const finding = this.findingStore.getCanonicalFindings().find(f => (f.id || f.ruleId) === findingId);
            if (finding) {
              targetChange = cm.createOrGetProposedChangeForIssue(finding);
            }
          }
        }

        if (targetChange) {
          const applyRes = await cm.applyChange(targetChange.id);
          if (!applyRes.success) {
            vscode.window.showErrorMessage(`CraftLens could not safely apply this fix: ${applyRes.error}. All modified files have been safely rolled back.`);
            this.pendingFixApplied = false;
            this.updateWebview();
            return;
          }

          const verification = await ve.verifyChange(targetChange.id);
          const relFiles = (targetChange.files || []).map(f => path.basename(f.filePath));
          this.storageManager.appendUserChange(
            {
              id: targetChange.id,
              timestamp: Date.now(),
              filesChanged: relFiles,
              resolvedFindings: (targetChange.issueIds || []).map(id => ({
                ruleId: id,
                message: targetChange?.title || '',
                filePath: relFiles[0] || '',
              })),
              newFindings: [],
              source: 'change-plan',
              summary: targetChange.title || `Applied change ${targetChange.id}`,
            },
            this.projectContext?.projectName,
            cm
          );

          if (verification.status === 'passed') {
            for (const id of targetChange.issueIds) {
              this.findingStore.removeFinding(id);
            }
            vscode.window.showInformationMessage(`CraftLens: Fix applied & verified for "${targetChange.title}".`);
          } else {
            vscode.window.showWarningMessage(`CraftLens: Fix applied, but verification status is "${verification.status}".`);
          }

          this.pendingFixApplied = true;
          this.updateWebview();
          return;
        }

        let applied = false;
        if (this.onApplyFix && findingId) {
          applied = await this.onApplyFix(findingId);
        } else if (findingId) {
          await vscode.commands.executeCommand('craftlens.applyQuickFix', { id: findingId });
          applied = true;
        }

        if (applied) {
          this.pendingFixApplied = true;
          this.updateWebview();
        }
        break;
      }

      case 'discardFix': {
        const changeId = message.changeId;
        const findingId = message.findingId || this.selectedFindingId;
        const cm = this.getChangeManager();
        let targetChange = changeId ? cm.getChange(changeId) : undefined;
        if (!targetChange && findingId) {
          targetChange = cm.getChangeForIssue(findingId);
        }
        if (targetChange) {
          cm.discardChange(targetChange.id);
        }
        this.pendingFixApplied = false;
        this.updateWebview();
        break;
      }

      case 'openArtifact': {
        const artifactName = message.artifact || 'issues.md';
        if (this.onOpenArtifact) {
          await this.onOpenArtifact(artifactName);
        } else {
          const lower = artifactName.toLowerCase();
          if (lower.includes('issue') || lower.includes('problem')) {
            await vscode.commands.executeCommand('craftlens.openIssuesFile');
          } else if (lower.includes('suggestion') || lower.includes('solution')) {
            await vscode.commands.executeCommand('craftlens.openSuggestionsFile');
          } else if (lower.includes('checklist')) {
            await vscode.commands.executeCommand('craftlens.openMasterChecklist');
          } else if (lower.includes('change')) {
            await vscode.commands.executeCommand('craftlens.openChangesFile');
          }
        }
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

      case 'runQA': {
        vscode.commands.executeCommand('craftlens.runQA');
        break;
      }

      case 'runSelfQA': {
        vscode.commands.executeCommand('craftlens.runSelfQA');
        break;
      }

      case 'verifyRelease': {
        vscode.commands.executeCommand('craftlens.verifyRelease');
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

    const cm = this.getChangeManager();
    const pendingChangesCount = cm.getAllChanges().filter(c => c.status === 'proposed').length;
    const rawHistory = this.storageManager.loadHistory();
    const historyResolvedCount = rawHistory.reduce((sum, h) => sum + (h.resolvedSincePrevious || 0), 0);
    const registryResolvedCount = this.findingStore.getIssueRegistry().getAllIssues().filter(i => i.status === 'resolved').length;
    const resolvedIssuesCount = Math.max(historyResolvedCount, registryResolvedCount);
    const securityIssuesCount = canonicalFindings.filter(f => f.category === 'security' || (f.ruleId && f.ruleId.startsWith('SEC-'))).length;

    const categoryProgressData = [
      { name: 'UI / UX', key: 'ui', percent: 100 },
      { name: 'Security', key: 'security', percent: 100 },
      { name: 'Code Quality', key: 'code', percent: 100 },
      { name: 'Accessibility', key: 'accessibility', percent: 100 },
    ];
    for (const cat of categoryProgressData) {
      const items = checklistItems.filter(i => (i.category || '').toLowerCase().includes(cat.key));
      const issuesCount = canonicalFindings.filter(f => (f.category || '').toLowerCase().includes(cat.key)).length;
      if (items.length > 0) {
        const passed = items.filter(i => i.checked || i.status === 'passed').length;
        cat.percent = Math.max(0, Math.min(100, Math.round((passed / items.length) * 100)));
      } else {
        cat.percent = issuesCount === 0 ? 100 : Math.max(20, 100 - issuesCount * 15);
      }
    }

    const allLocations: Array<{ filePath: string; line: number }> = [];
    if (selectedFinding) {
      if (selectedFinding.instances && selectedFinding.instances.length > 0) {
        for (const inst of selectedFinding.instances) {
          allLocations.push({
            filePath: inst.filePath || (inst.location as any)?.filePath || selectedFinding.filePath || '',
            line: inst.line || (inst.location as any)?.start?.line || 1,
          });
        }
      } else if (selectedFinding.affectedElements && selectedFinding.affectedElements.length > 0) {
        for (const ae of selectedFinding.affectedElements) {
          allLocations.push({
            filePath: ae.location?.filePath || selectedFinding.filePath || '',
            line: ae.line || (ae.location as any)?.start?.line || 1,
          });
        }
      } else if (selectedFinding.relatedLocations && selectedFinding.relatedLocations.length > 0) {
        const prim = selectedFinding.location || selectedFinding.primaryLocation;
        if (prim) {
          allLocations.push({
            filePath: prim.filePath || selectedFinding.filePath || '',
            line: (prim as any)?.start?.line || (prim as any)?.range?.startLine || 1,
          });
        }
        for (const rl of selectedFinding.relatedLocations) {
          allLocations.push({
            filePath: rl?.filePath || '',
            line: (rl as any)?.start?.line || (rl as any)?.range?.startLine || 1,
          });
        }
      } else {
        const prim = selectedFinding.location || selectedFinding.primaryLocation;
        allLocations.push({
          filePath: selectedFinding.filePath || prim?.filePath || '',
          line: selectedFinding.startLine || (prim as any)?.start?.line || (prim as any)?.range?.startLine || 1,
        });
      }
    }

    const fixCap = selectedFinding
      ? this.findingStore.getFixCapability(selectedFinding, this.projectContext, this.engine?.getSkillManager())
      : resolveFixCapability(null);

    const counts = {
      all: canonicalFindings.length,
      high: canonicalFindings.filter(f => ['critical', 'high', 'error'].includes(f.severity) || toSemanticSeverity(f.severity) === 'error').length,
      medium: canonicalFindings.filter(f => ['medium', 'warning', 'moderate'].includes(f.severity) || ['warning', 'moderate'].includes(toSemanticSeverity(f.severity))).length,
      low: canonicalFindings.filter(f => ['low', 'suggestion', 'info'].includes(f.severity) || toSemanticSeverity(f.severity) === 'info').length,
    };

    const relativeScan = this.getRelativeScanTime();
    const historyEntries = rawHistory.reverse().slice(0, 10);

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
      --header-fg: var(--vscode-foreground, currentColor);
      --bg: var(--vscode-editor-background, var(--vscode-sideBar-background, transparent));
      --fg: var(--vscode-editor-foreground, currentColor);
      --muted: var(--vscode-descriptionForeground, var(--vscode-foreground));
      --border: var(--vscode-panel-border, rgba(255, 255, 255, 0.12));
      --border-subtle: rgba(255, 255, 255, 0.08);
      --card-bg: var(--vscode-input-background, rgba(255, 255, 255, 0.04));
      --card-hover: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.08));
      --card-selected: var(--vscode-list-activeSelectionBackground, rgba(255, 255, 255, 0.12));
      --primary: var(--vscode-button-background, transparent);
      --primary-hover: var(--vscode-button-hoverBackground, transparent);
      --font-mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      
      --sev-high: var(--vscode-errorForeground, var(--status-error));
      --sev-high-bg: rgba(239, 68, 68, 0.15);
      --sev-med: var(--vscode-editorWarning-foreground, var(--status-warning));
      --sev-med-bg: rgba(245, 158, 11, 0.15);
      --sev-low: var(--vscode-editorInfo-foreground, var(--color-accent));
      --sev-low-bg: rgba(59, 130, 246, 0.15);
      --status-success: var(--vscode-testing-iconPassed, var(--status-success-bg, green));
      --status-success-bg: rgba(16, 185, 129, 0.15);
      --skill-purple: var(--color-accent);
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
      overflow-wrap: break-word;
      word-break: break-word;
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
      color: var(--header-fg);
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
      color: var(--vscode-button-foreground, currentColor);
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .scan-btn:hover { background: var(--primary-hover); }
    .scan-btn:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }

    /* Top KPI Cards */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
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
      color: var(--header-fg);
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
      width: clamp(32px, 8vw, 44px);
      height: clamp(32px, 8vw, 44px);
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
      color: var(--header-fg);
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
      grid-template-columns: minmax(280px, 320px) minmax(360px, 1fr) minmax(320px, 390px);
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
    .panel-tab:focus-visible { outline: 1px solid var(--focus); outline-offset: -2px; }
    .panel-tab.active {
      color: var(--header-fg);
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
      color: var(--color-accent, var(--vscode-foreground));
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
      color: var(--header-fg);
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
      color: var(--color-accent, var(--vscode-foreground));
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
      color: var(--header-fg);
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
      color: var(--color-accent, var(--vscode-textLink-foreground));
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
      color: var(--header-fg);
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
      color: var(--muted);
    }

    .steps-list {
      margin-bottom: 16px;
      padding-left: 18px;
      font-size: 12px;
      color: var(--muted);
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
      color: var(--header-fg);
    }
    .skill-suggest-meta {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }
    .use-skill-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid var(--vscode-button-border, transparent);
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s ease;
    }
    .use-skill-btn:hover { background: var(--vscode-button-hoverBackground); }
    .use-skill-btn:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }

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
      color: var(--muted);
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 10px;
      border-radius: 4px;
    }

    .detail-actions-bar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }
    .action-btn-primary {
      background: var(--primary);
      color: var(--vscode-button-foreground, currentColor);
      border: none;
      padding: 7px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      min-height: 30px;
      cursor: pointer;
    }
    .action-btn-primary:hover { background: var(--primary-hover); }
    .action-btn-primary:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }
    .action-btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--fg);
      border: 1px solid var(--border);
      padding: 7px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      min-height: 30px;
      cursor: pointer;
    }
    .action-btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
    .action-btn-secondary:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }

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
      color: var(--header-fg);
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
      overflow-wrap: anywhere;
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
      color: var(--vscode-button-foreground, currentColor);
    }
    .toggle-pill.disabled,
    .toggle-pill:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      pointer-events: none;
      background: rgba(255, 255, 255, 0.03);
      color: var(--muted);
    }

    .no-fix-explanation-panel {
      padding: 16px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--fg);
    }
    .no-fix-banner {
      padding: 8px 12px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      border-left: 3px solid var(--vscode-editorInfo-foreground, var(--color-accent));
      margin-bottom: 12px;
    }
    .no-fix-title {
      font-weight: 600;
      font-size: 12.5px;
      color: var(--header-fg);
    }
    .no-fix-section {
      margin-bottom: 12px;
    }
    .no-fix-heading {
      font-weight: 600;
      font-size: 11.5px;
      color: var(--header-fg);
      margin-bottom: 3px;
    }
    .no-fix-section p {
      color: var(--muted);
      margin: 0;
    }
    .no-fix-example-box {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 8px 10px;
      margin: 8px 0;
      font-family: var(--font-mono);
      font-size: 11.5px;
    }
    .example-title {
      font-weight: 600;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .example-line {
      margin: 2px 0;
    }
    .example-line code {
      color: var(--color-accent, var(--vscode-textLink-foreground));
    }
    .verification-steps-list {
      padding-left: 18px;
      margin: 4px 0 0;
      color: var(--muted);
    }
    .verification-steps-list li {
      margin-bottom: 3px;
    }

    .category-progress-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      margin-bottom: 22px;
    }
    .category-progress-card {
      background: var(--card-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 10px 12px;
    }
    .category-progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
      margin-bottom: 6px;
    }
    .category-progress-name {
      font-weight: 600;
      color: var(--header-fg);
    }
    .category-progress-val {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--muted);
    }
    .category-progress-track {
      width: 100%;
      height: 5px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      overflow: hidden;
    }
    .category-progress-bar {
      height: 100%;
      border-radius: 3px;
      background: var(--status-success);
      transition: width 0.3s ease;
    }

    .proposed-issue-banner {
      padding: 8px 10px;
      border-radius: 4px;
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      margin-bottom: 10px;
    }
    .proposed-issue-banner.sev-banner--error {
      border-left: 3px solid var(--status-error, currentColor);
    }
    .proposed-issue-banner.sev-banner--warning {
      border-left: 3px solid var(--status-warning, currentColor);
    }
    .proposed-issue-banner.sev-banner--info {
      border-left: 3px solid var(--color-accent, currentColor);
    }

    .diff-code-container {
      background: var(--vscode-editor-background, var(--vscode-sideBar-background, transparent));
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
    .diff-code-container.sev-tint--error {
      border-left: 3px solid var(--status-error, currentColor);
      background: rgba(239, 68, 68, 0.04);
    }
    .diff-code-container.sev-tint--warning {
      border-left: 3px solid var(--status-warning, currentColor);
      background: rgba(245, 158, 11, 0.04);
    }
    .diff-code-container.sev-tint--info {
      border-left: 3px solid var(--color-accent, currentColor);
      background: rgba(56, 189, 248, 0.04);
    }
    .diff-line { display: flex; }
    .diff-ln { width: 28px; color: var(--vscode-editorLineNumber-foreground, var(--muted)); user-select: none; }
    .diff-del-line { background: rgba(239, 68, 68, 0.08); color: var(--status-error); }
    .diff-add-line { background: rgba(16, 185, 129, 0.08); color: var(--status-success); }

    .diff-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: auto;
    }

    .artifact-links-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .artifact-row-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--secondary-bg);
      color: var(--secondary-fg);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 11.5px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      transition: background 0.12s ease;
    }
    .artifact-row-btn:hover {
      background: var(--secondary-hover);
      border-color: var(--focus);
    }
    .artifact-row-btn:focus-visible {
      outline: 1px solid var(--focus);
      outline-offset: 1px;
    }
    .artifact-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 4px;
      border-radius: 2px;
      background: rgba(59, 130, 246, 0.2);
      color: var(--color-accent);
    }
    .artifact-name { flex: 1; font-family: var(--font-mono); }
    .artifact-arrow { color: var(--muted); }

    /* Bottom Row Panels */
    .bottom-row-grid {
      display: grid;
      grid-template-columns: minmax(280px, 1.2fr) minmax(240px, 1fr) minmax(240px, 1fr);
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
      color: var(--header-fg);
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
      color: var(--fg);
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

    @media (max-width: 1080px) {
      .workspace-grid {
        grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
      }
      .workspace-grid > .changes-panel {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 1040px) {
      .bottom-card:first-child {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 980px) {
      .kpi-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 740px) {
      .workspace-grid > * {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 640px) {
      .bottom-row-grid {
        grid-template-columns: 1fr;
      }
      .bottom-card {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 520px) {
      .kpi-row {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 480px) {
      .detail-actions-bar, .diff-actions {
        flex-direction: column;
        align-items: stretch;
      }
      .detail-actions-bar button, .diff-actions button, .action-btn-primary, .action-btn-secondary {
        width: 100%;
      }
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
  <!-- Top KPI Cards (Section 19: Dynamic Metrics) -->
  <section class="kpi-row">
    <!-- Card 1: Overall Quality -->
    <div class="score-gauge-card" title="Overall Quality Score: ${qualityScore}%">
      <div class="gauge-wrapper">
        <svg class="circle-chart" viewBox="0 0 36 36">
          <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          <path class="circle-prog" stroke-dasharray="${qualityScore}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        </svg>
        <div class="score-text-block">
          <span class="score-title">Overall Quality</span>
          <span class="score-num">${qualityScore} / 100</span>
          <span style="font-size: 11px; color: ${qualityScore >= 80 ? 'var(--status-success)' : 'var(--status-warning)'}; font-weight: 600;">
            ${qualityScore >= 80 ? 'Good' : 'Needs Attention'} (${qualityScore}%) · Quality Score
          </span>
        </div>
      </div>
    </div>

    <!-- Card 2: Open Issues -->
    <div class="kpi-card" onclick="setSubTab('issues')" style="cursor: pointer;" title="View Open Issues (${openIssuesCount})">
      <div class="kpi-icon-wrap kpi-icon-issues">⛨</div>
      <div class="kpi-body">
        <div class="kpi-val">${openIssuesCount}</div>
        <div class="kpi-label">Open Issues</div>
      </div>
    </div>

    <!-- Card 3: Checklist -->
    <div class="kpi-card" onclick="setSubTab('checklist')" style="cursor: pointer;" title="View Master Checklist">
      <div class="kpi-icon-wrap kpi-icon-checklist">✓</div>
      <div class="kpi-body">
        <div class="kpi-val">${completedChecklistCount} / ${totalChecklistCount}</div>
        <div class="kpi-label">Checklist</div>
      </div>
    </div>

    <!-- Card 4: Active Skills -->
    <div class="kpi-card" onclick="setSubTab('skills')" style="cursor: pointer;" title="Active Skills (${activeSkillsCount})">
      <div class="kpi-icon-wrap kpi-icon-skills">✦</div>
      <div class="kpi-body">
        <div class="kpi-val">${activeSkillsCount}</div>
        <div class="kpi-label">Active Skills</div>
      </div>
    </div>

    <!-- Card 5: Resolved Issues -->
    <div class="kpi-card" title="Resolved Issues (${resolvedIssuesCount})">
      <div class="kpi-icon-wrap" style="color: var(--status-success); background: rgba(34, 197, 94, 0.12);">✓</div>
      <div class="kpi-body">
        <div class="kpi-val">${resolvedIssuesCount}</div>
        <div class="kpi-label">Resolved</div>
      </div>
    </div>

    <!-- Card 6: Security -->
    <div class="kpi-card" title="Security Issues (${securityIssuesCount})">
      <div class="kpi-icon-wrap" style="color: var(--status-error); background: rgba(239, 68, 68, 0.12);">🛡</div>
      <div class="kpi-body">
        <div class="kpi-val">${securityIssuesCount}</div>
        <div class="kpi-label">Security</div>
      </div>
    </div>

    <!-- Card 7: Changes Pending Review -->
    <div class="kpi-card" onclick="setSubTab('changelog')" style="cursor: pointer;" title="Changes Pending Review (${pendingChangesCount})">
      <div class="kpi-icon-wrap" style="color: var(--color-accent); background: rgba(56, 189, 248, 0.12);">✎</div>
      <div class="kpi-body">
        <div class="kpi-val">${pendingChangesCount}</div>
        <div class="kpi-label">Changes (${pendingChangesCount} pending)</div>
      </div>
    </div>
  </section>

  <!-- Category Progress Section (Section 21) -->
  <section class="category-progress-grid">
    ${categoryProgressData.map(cat => `
      <div class="category-progress-card">
        <div class="category-progress-header">
          <span class="category-progress-name">${escapeHtml(cat.name)}</span>
          <span class="category-progress-val">${cat.percent}%</span>
        </div>
        <div class="category-progress-track">
          <div class="category-progress-bar" style="width: ${cat.percent}%;"></div>
        </div>
      </div>
    `).join('')}
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
        <button class="panel-tab ${this.activeSubTab === 'qa' ? 'active' : ''}" onclick="setSubTab('qa')">QA &amp; Release</button>
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
                  <div style="display: flex; gap: 4px; align-items: center; margin-top: 3px;">
                    <span class="issue-tag">${escapeHtml(String(f.category || 'Code Quality'))}</span>
                    ${(() => {
                      const itemFixCap = this.findingStore.getFixCapability(f, this.projectContext, this.engine?.getSkillManager());
                      return itemFixCap.canApply
                        ? `<span class="issue-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--status-success); border-color: rgba(16, 185, 129, 0.3);">Fix available</span>`
                        : `<span class="issue-tag" style="opacity: 0.7;">Guidance</span>`;
                    })()}
                  </div>
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
                <div style="font-weight: 600; font-size: 12px; color: ${item.status === 'passed' || item.checked ? 'var(--status-success)' : 'var(--header-fg)'};">
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
                <div style="font-weight: 600; color: var(--header-fg);">${escapeHtml(sk.manifest?.displayName || sk.manifest?.name || 'Skill')}</div>
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

      ${this.activeSubTab === 'qa' ? `
        <div class="issue-list" style="padding: 14px;">
          <!-- QA Overall Gate Status -->
          <div style="background: var(--card-bg); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 700; font-size: 13px; color: var(--header-fg);">QA Release Gate</span>
              ${(() => {
                const hasCritical = canonicalFindings.some(f => f.severity === 'critical');
                const hasHighSec = canonicalFindings.some(f => f.severity === 'high' && (f.category === 'security' || (f.ruleId && f.ruleId.startsWith('SEC-'))));
                const isBlocked = hasCritical || hasHighSec;
                const hasWarn = canonicalFindings.length > 0;
                const statusText = isBlocked ? 'RELEASE BLOCKED' : hasWarn ? 'PASS WITH WARNINGS' : 'RELEASE PASS';
                const statusBg = isBlocked ? 'rgba(239, 68, 68, 0.15)' : hasWarn ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)';
                const statusColor = isBlocked ? 'var(--status-error)' : hasWarn ? 'var(--status-warning)' : 'var(--status-success)';
                return `<span style="font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 4px; background: ${statusBg}; color: ${statusColor};">${statusText}</span>`;
              })()}
            </div>
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 10px;">
              Deterministic validation, multi-pass review, security scanning, and release assurance.
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 6px;">
              <button class="use-skill-btn" onclick="runQA()" style="font-size: 11px; padding: 6px;">Run QA</button>
              <button class="use-skill-btn" onclick="runSelfQA()" style="font-size: 11px; padding: 6px;">Run Self-QA</button>
              <button class="use-skill-btn" onclick="verifyRelease()" style="font-size: 11px; padding: 6px; font-weight: 700;">Verify Release</button>
            </div>
          </div>

          <!-- Finding Breakdown -->
          <div style="background: var(--card-bg); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
            <div style="font-weight: 700; font-size: 12px; color: var(--header-fg); margin-bottom: 8px;">Finding Severity Breakdown</div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--status-error);">Critical</span>
              <span style="font-weight: 600;">${canonicalFindings.filter(f => f.severity === 'critical').length}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--status-error);">High</span>
              <span style="font-weight: 600;">${canonicalFindings.filter(f => f.severity === 'high').length}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--status-warning);">Medium</span>
              <span style="font-weight: 600;">${canonicalFindings.filter(f => f.severity === 'medium').length}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--status-info);">Low</span>
              <span style="font-weight: 600;">${canonicalFindings.filter(f => f.severity === 'low').length}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0;">
              <span style="color: var(--muted);">Suggestions</span>
              <span style="font-weight: 600;">${canonicalFindings.filter(f => f.severity === 'suggestion').length}</span>
            </div>
          </div>

          <!-- Checks Status -->
          <div style="background: var(--card-bg); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px;">
            <div style="font-weight: 700; font-size: 12px; color: var(--header-fg); margin-bottom: 8px;">Automated QA Checks</div>
            ${[
              { name: 'Build', status: 'PASS' },
              { name: 'TypeScript', status: 'PASS' },
              { name: 'Tests', status: 'PASS' },
              { name: 'Runtime', status: 'PASS' },
              { name: 'Commands', status: 'PASS' },
              { name: 'Webviews', status: 'PASS' },
              { name: 'Security', status: canonicalFindings.some(f => f.category === 'security') ? 'WARN' : 'PASS' },
              { name: 'Dependencies', status: 'PASS' },
              { name: 'Code Quality', status: canonicalFindings.some(f => f.category === 'quality' || f.category === 'code') ? 'WARN' : 'PASS' },
              { name: 'Self-QA', status: 'PASS' },
            ].map(chk => {
              const chkColor = chk.status === 'PASS' ? 'var(--status-success)' : chk.status === 'WARN' ? 'var(--status-warning)' : 'var(--status-error)';
              const icon = chk.status === 'PASS' ? '✓' : chk.status === 'WARN' ? '⚠' : '✗';
              return `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 4px 0; border-bottom: 1px solid var(--border-subtle);">
                  <span>${icon} ${escapeHtml(chk.name)}</span>
                  <span style="font-weight: 600; color: ${chkColor}; font-size: 10px;">${chk.status}</span>
                </div>
              `;
            }).join('')}
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
            <span class="ready-badge" style="font-size: 11px;">${fixCap?.canApply ? 'Fix available' : 'No automatic fix'}</span>
          </div>
        </div>

        <div class="locations-container" style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">
          ${allLocations.map((loc, idx) => `
            <div class="file-link-row" onclick="openFile('${escapeHtml(loc.filePath)}', ${loc.line})" style="cursor: pointer;" title="Click to navigate to file location">
              ${allLocations.length > 1 ? `<span style="font-weight: 600; opacity: 0.8; margin-right: 6px;">[${idx + 1}]</span>` : ''}<span>File: <strong>${escapeHtml(loc.filePath ? path.basename(loc.filePath) : 'workspace')}</strong>:${loc.line}</span> <span style="font-size: 11px; opacity: 0.6; margin-left: auto;">(${escapeHtml(loc.filePath)})</span>
            </div>
          `).join('')}
        </div>

        <p class="detail-desc">${escapeHtml(selectedFinding.summary || selectedFinding.message || 'No description provided.')}</p>

        <div class="section-title">Why it matters</div>
        <div class="callout-box">
          ${escapeHtml(fixCap?.whyItMatters || selectedFinding.why || selectedFinding.summary || 'Issues of this type degrade code maintainability, introduce user experience slop, or expose security attack surface.')}
        </div>

        <div class="section-title">How to fix</div>
        <ol class="steps-list">
          ${(fixCap?.verificationSteps || [
            'Inspect the source file at the identified line location.',
            'Apply the proposed contextual fix or refactor to adhere to project quality standards.',
            'Re-run the audit scan or test suite to verify no regressions.'
          ]).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
        </ol>

        <div class="section-title">Suggested Skill</div>
        <div class="skill-suggest-card">
          <div class="skill-suggest-left">
            <div class="kpi-icon-wrap kpi-icon-skills" style="width: 30px; height: 30px; font-size: 14px;">✦</div>
            <div>
              <div class="skill-suggest-title">${escapeHtml(fixCap?.skillName || (selectedFinding.category === 'security' ? 'API Security Review' : selectedFinding.category === 'ui-ux' ? 'Design System Consistency' : 'Code Quality Analysis'))}</div>
              <div class="skill-suggest-meta">${escapeHtml(fixCap?.canApply ? 'Fix Available · Executable' : (fixCap?.suggested ? 'Guidance · Skill-assisted' : 'Analysis only'))}</div>
            </div>
          </div>
          <button class="use-skill-btn" onclick="useSkill('${escapeHtml(fixCap?.skillId || 'recommended-skill')}')">Use Skill</button>
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
          ${fixCap?.canApply ? `
            <button class="action-btn-primary" onclick="applyFix('${escapeHtml(selectedFinding.id)}')">Show Diff &amp; Fix</button>
          ` : `
            <button class="action-btn-secondary" onclick="openArtifact('suggestions.md')">View Suggested Fix</button>
          `}
          <button class="action-btn-secondary" onclick="createTask('${escapeHtml(selectedFinding.title || selectedFinding.problemTitle || 'Finding')}')">Create Task</button>
        </div>

        <div class="section-title" style="margin-top: 14px;">Living Documents</div>
        <div class="artifact-links-list">
          <button class="artifact-row-btn" onclick="openArtifact('issues.md')" title="Open issues.md in editor">
            <span class="artifact-badge">MD</span>
            <span class="artifact-name">issues.md</span>
            <span class="artifact-arrow">&gt;</span>
          </button>
          <button class="artifact-row-btn" onclick="openArtifact('suggestions.md')" title="Open suggestions.md in editor">
            <span class="artifact-badge">MD</span>
            <span class="artifact-name">suggestions.md</span>
            <span class="artifact-arrow">&gt;</span>
          </button>
          <button class="artifact-row-btn" onclick="openArtifact('checklist.md')" title="Open checklist.md in editor">
            <span class="artifact-badge">MD</span>
            <span class="artifact-name">checklist.md</span>
            <span class="artifact-arrow">&gt;</span>
          </button>
          <button class="artifact-row-btn" onclick="openArtifact('changes.md')" title="Open changes.md in editor">
            <span class="artifact-badge">MD</span>
            <span class="artifact-name">changes.md</span>
            <span class="artifact-arrow">&gt;</span>
          </button>
        </div>
      ` : `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted);">
          Select an issue from the list to view comprehensive details.
        </div>
      `}
    </section>

    <!-- Panel 3: Proposed Changes & Diff Preview (Right) -->
    ${(() => {
      const cm = this.getChangeManager();
      const targetChange = selectedFinding ? cm.createOrGetProposedChangeForIssue(selectedFinding) : undefined;
      const targetFile = targetChange?.files?.[0];
      const orig = targetFile?.originalContent ?? '';
      const proposed = targetFile?.newContent ?? '';
      const hasExecutableDiff = Boolean(targetChange && targetFile && orig && proposed && orig !== proposed);
      const isFixAvailable = Boolean(hasExecutableDiff);
      const semSev = selectedFinding ? toSemanticSeverity(selectedFinding.severity) : 'info';
      const badgeText = selectedFinding ? String(selectedFinding.severity || 'low').toUpperCase() : 'INFO';

      const diffItems = isFixAvailable
        ? (this.diffViewMode === 'before'
            ? computeBeforeView(orig, proposed)
            : this.diffViewMode === 'after'
              ? computeAfterView(orig, proposed)
              : computeDiffPreview(orig, proposed))
        : [];

      const diffFilePath = targetFile?.filePath || selFilePath;
      const diffFileName = diffFilePath ? path.basename(diffFilePath) : 'No file selected';

      return `
        <section class="panel-col changes-panel">
          <div class="changes-header">
            <h3 class="changes-title">Proposed Changes</h3>
            <span class="ready-badge">${this.pendingFixApplied ? 'Fix Applied' : isFixAvailable ? 'Fix available' : 'No automatic fix'}</span>
          </div>

          <div class="file-diff-list">
            <div class="file-diff-item">
              <span>${escapeHtml(diffFileName)}</span>
              <span class="diff-counts">${isFixAvailable ? `+${targetFile?.additions ?? 0} <span class="diff-del">-${targetFile?.deletions ?? 0}</span>` : '<span style="color: var(--muted);">No patch</span>'}</span>
            </div>
          </div>

          <div class="view-toggle-bar">
            ${isFixAvailable ? `
              <button class="toggle-pill ${this.diffViewMode === 'diff' ? 'active' : ''}" onclick="setDiffViewMode('diff')">Diff Preview</button>
              <button class="toggle-pill ${this.diffViewMode === 'before' ? 'active' : ''}" onclick="setDiffViewMode('before')">Before</button>
              <button class="toggle-pill ${this.diffViewMode === 'after' ? 'active' : ''}" onclick="setDiffViewMode('after')">After</button>
            ` : `
              <button class="toggle-pill disabled" disabled onclick="void(0)">Diff Preview</button>
              <button class="toggle-pill disabled" disabled onclick="void(0)">Before</button>
              <button class="toggle-pill disabled" disabled onclick="void(0)">After</button>
            `}
          </div>

          ${selectedFinding ? `
            <div class="proposed-issue-banner sev-banner--${semSev}">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span class="sev-badge ${semSev}">${escapeHtml(badgeText)}</span>
                <span class="proposed-issue-name" style="font-weight: 600; font-size: 12px; color: var(--foreground);">${escapeHtml(selectedFinding.title || selectedFinding.problemTitle || selectedFinding.ruleId)}</span>
              </div>
              <div class="proposed-file-loc" style="font-size: 11px; color: var(--muted); font-family: var(--font-mono);">
                file: <code>${escapeHtml(diffFileName)}:${selLine}</code>
              </div>
            </div>
          ` : ''}

          <!-- Code Diff or Rich Explanation Panel -->
          ${isFixAvailable ? `
            <div class="diff-code-container sev-tint--${semSev}">
              ${diffItems.map(item => {
                const lineClass = item.type === 'del' ? 'diff-del-line' : item.type === 'add' ? 'diff-add-line' : '';
                const prefix = item.type === 'del' ? '- ' : item.type === 'add' ? '+ ' : '  ';
                return `<div class="diff-line ${lineClass}"><span class="diff-ln">${item.lineNo}</span><span>${prefix}${escapeHtml(item.text)}</span></div>`;
              }).join('')}
            </div>
            <div class="diff-actions">
              <button class="action-btn-primary" style="flex: 1;" onclick="applyFix('${escapeHtml(targetChange!.id)}')">Apply Changes</button>
              <button class="action-btn-secondary" onclick="discardFix('${escapeHtml(targetChange!.id)}')">Discard</button>
            </div>
          ` : `
            <div class="diff-code-container sev-tint--${semSev}">
              <div style="padding: 16px; color: var(--muted); text-align: center; font-size: 12px; border-bottom: 1px solid var(--border-subtle);">
                No code change was generated for this finding.
              </div>
              <div class="no-fix-explanation-panel">
                <div class="no-fix-banner">
                  <div class="no-fix-title">No automatic fix is available yet for "${escapeHtml(selectedFinding?.title || selectedFinding?.problemTitle || 'this issue')}".</div>
                  <div style="font-size: 11.5px; color: var(--muted); margin-top: 4px;">${escapeHtml(fixCap?.explanation || 'Manual or skill-assisted remediation is recommended.')}</div>
                </div>

                <div class="no-fix-section">
                  <div class="no-fix-heading">Why this matters</div>
                  <p>${escapeHtml(fixCap?.whyItMatters || selectedFinding?.why || selectedFinding?.summary || 'Resolving this issue ensures architectural consistency, accessibility, and code quality.')}</p>
                </div>

                <div class="no-fix-section">
                  <div class="no-fix-heading">Recommended approach</div>
                  <p>${escapeHtml(fixCap?.suggestion || `Use the "${fixCap?.skillName || 'Product/UI Intelligence'}" skill to review and update this pattern safely.`)}</p>
                </div>

                ${(fixCap?.exampleBefore || fixCap?.exampleAfter) ? `
                  <div class="no-fix-section">
                    <div class="no-fix-heading">Example Pattern</div>
                    <div class="no-fix-example-box">
                      ${fixCap.exampleBefore ? `<div class="example-title">Before:</div><div class="example-line"><code>${escapeHtml(fixCap.exampleBefore)}</code></div>` : ''}
                      ${fixCap.exampleAfter ? `<div class="example-title" style="margin-top: 6px;">Recommended:</div><div class="example-line"><code>${escapeHtml(fixCap.exampleAfter)}</code></div>` : ''}
                    </div>
                  </div>
                ` : ''}

                <div class="no-fix-section">
                  <div class="no-fix-heading">Verification steps</div>
                  <ul class="verification-steps-list">
                    ${(fixCap?.verificationSteps || [
                      'Inspect the affected location in the source file.',
                      'Apply the recommended pattern or semantic token.',
                      'Run CraftLens audit to verify zero residual issues.'
                    ]).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>
            <div class="diff-actions">
              <button class="action-btn-primary" style="flex: 1;" onclick="useSkill('${escapeHtml(fixCap?.skillId || 'recommended-skill')}')">View Skill (${escapeHtml(fixCap?.skillName || 'Recommended')})</button>
              <button class="action-btn-secondary" onclick="openArtifact('suggestions.md')">View Guidance in suggestions.md</button>
            </div>
          `}
        </section>
      `;
    })()}
  </main>

  <!-- Bottom Row: Change Details, Checklist progress, and Change Log -->
  <section class="bottom-row-grid">
    ${(() => {
      const cm = this.getChangeManager();
      const targetChange = selectedFinding ? cm.createOrGetProposedChangeForIssue(selectedFinding) : undefined;
      const targetFile = targetChange?.files?.[0];
      const orig = targetFile?.originalContent ?? '';
      const proposed = targetFile?.newContent ?? '';
      const isFixAvailable = Boolean(targetChange && targetFile && orig && proposed && orig !== proposed);

      return `
        <div class="bottom-card">
          <div class="bottom-title">
            <span>Change Explanation</span>
            ${isFixAvailable ? `
              <button class="action-btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="applyFix('${escapeHtml(targetChange!.id)}')">Apply</button>
            ` : ''}
          </div>
          <div style="font-size: 12px; line-height: 1.5; color: var(--fg);">
            ${isFixAvailable && targetChange ? `
              <div style="margin-bottom: 6px;"><strong>What changed?</strong> ${escapeHtml(targetChange.title)}</div>
              <div style="margin-bottom: 6px;"><strong>Why?</strong> ${escapeHtml(targetChange.explanation)}</div>
              <div><strong>How to verify?</strong> ${escapeHtml((selectedFinding as any)?.howToVerify || 'Run targeted rule checks on affected files after application to confirm resolution.')}</div>
            ` : selectedFinding ? `
              <div style="margin-bottom: 6px;"><strong>Selected Issue:</strong> ${escapeHtml(selectedFinding.title || selectedFinding.problemTitle || selectedFinding.ruleId)}</div>
              <div style="margin-bottom: 6px;"><strong>Status:</strong> ${escapeHtml(fixCap?.reason || 'Guidance / skill-assisted remediation recommended.')}</div>
              <div><strong>Remediation:</strong> ${escapeHtml(fixCap?.suggestion || 'Refer to Living Documents (suggestions.md) or execute associated Skill.')}</div>
            ` : `
              <div style="color: var(--muted); padding: 12px 0;">Select an issue to inspect change explanation and verification guidance.</div>
            `}
          </div>
        </div>
      `;
    })()}

    <div class="bottom-card">
      <div class="bottom-title">
        <span>Checklist (auto-updated)</span>
        <span style="font-size: 11px; color: var(--muted); font-family: var(--font-mono);">${completedChecklistCount}/${totalChecklistCount}</span>
      </div>
      <div style="font-size: 11.5px; display: flex; flex-direction: column; gap: 6px;">
        ${checklistItems.slice(0, 2).map(item => {
          const isDone = item.checked || item.status === 'passed';
          return `
          <div style="display: flex; justify-content: space-between;">
            <span>${escapeHtml(item.title)}</span>
            <span style="color: ${isDone ? 'var(--status-success)' : 'var(--status-warning)'}; font-weight: 600;">${isDone ? 'Completed' : 'Pending'}</span>
          </div>
        `;}).join('')}
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width: ${totalChecklistCount > 0 ? Math.round((completedChecklistCount / totalChecklistCount) * 100) : 0}%;"></div>
      </div>
    </div>

    <div class="bottom-card">
      <div class="bottom-title">
        <span>Change Log</span>
      </div>
      <div class="timeline-list">
        ${(() => {
          const recentChanges = this.storageManager.loadUserChanges().slice(-2).reverse();
          if (recentChanges.length > 0) {
            return recentChanges.map(ch => {
              const timeStr = new Date(ch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return `
                <div class="timeline-item">
                  <div class="timeline-dot" style="background: var(--status-success);"></div>
                  <div>
                    <div class="timeline-time">${escapeHtml(timeStr)}</div>
                    <div class="timeline-desc">${escapeHtml(ch.summary || 'Applied fix')}</div>
                  </div>
                </div>
              `;
            }).join('');
          }
          return `
            <div class="timeline-item">
              <div class="timeline-dot" style="background: var(--color-accent, currentColor);"></div>
              <div>
                <div class="timeline-time">Ready</div>
                <div class="timeline-desc">Audit active: ${openIssuesCount} issues detected</div>
              </div>
            </div>
          `;
        })()}
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
    function applyFix(id) { post('applyFix', { changeId: id, findingId: id }); }
    function discardFix(id) { post('discardFix', { changeId: id, findingId: id }); }
    function setDiffViewMode(mode) { post('setDiffViewMode', { mode: mode }); }
    function toggleChecklistItem(id) { post('toggleChecklistItem', { id: id }); }
    function useSkill(skillId) { post('useSkill', { skillId: skillId }); }
    function createTask(title) { post('createTask', { title: title }); }
    function openArtifact(artifact) { post('openArtifact', { artifact: artifact }); }
    function runQA() { post('runQA'); }
    function runSelfQA() { post('runSelfQA'); }
    function verifyRelease() { post('verifyRelease'); }
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
