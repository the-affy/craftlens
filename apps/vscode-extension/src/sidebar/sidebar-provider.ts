import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  FindingStore,
  AuditStorageManager,
  Finding,
  FindingCategory,
  FindingSeverity,
  AuditState,
  FindingInstance,
  RecommendationEngine,
  RuleExecutionMode,
  SkillPackage,
  Rule,
  MasterChecklist,
  ChecklistItem,
  AuditLevel,
  ProjectContext,
  UserRuleGroup,
  UserRuleItem,
  toSemanticSeverity,
  SEMANTIC_SEVERITY_MAP,
  CanonicalSeverity,
  Suggestion,
  recommendSkillsForProject,
  createDefaultProjectContext,
  Skill,
  SkillDiscoveryService,
  ECOSYSTEM_SKILLS,
} from '@craftlens/core';
import { ConfigurationManager } from '../configuration/config-manager.js';
import { RuleEngine } from '@craftlens/rule-engine';

function escapeHtml(text: string | null | undefined): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class CraftLensSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'craftlens.sidebar';

  private _view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];
  private viewDisposables: vscode.Disposable[] = [];
  private recommendationEngine: RecommendationEngine;
  private expandedCategories: Set<string> = new Set(['ui-ux', 'content', 'code', 'code-quality', 'security', 'accessibility', 'performance']);
  private expandedFindingIds: Set<string> = new Set();
  private selectedFindingId: string | null = null;
  private expandedChecklistCriterionId: string | null = null;

  private activeTab: 'issues' | 'rules' | 'skills' | 'audit' | 'metrics' | 'checklist' = 'issues';
  private ruleSourceMode: 'builtin' | 'user' | 'combined' = 'combined';
  private expandedRuleGroups: Set<string> = new Set(['grp_ui_rules']);
  private expandedSkills: Set<string> = new Set(['ui-ux-quality']);
  private expandedRuleIds: Set<string> = new Set();

  private selectedSkillId: string | null = null;
  private selectedRuleId: string | null = null;
  private ruleCategoryFilter: string = 'all';
  private ruleSearchQuery: string = '';
  private issueFilter: string = 'all';
  private issueSearchQuery: string = '';
  private projectContext?: ProjectContext;

  private discoveryService = new SkillDiscoveryService();
  private skillSearchQuery: string = '';
  private selectedSkillCategory: string = 'all';
  private showAllRecommendations: boolean = false;
  private isOfflineMode: boolean = false;
  private installingSkills: Set<string> = new Set();
  private selectedSkillDetails: string | null = null;
  private searchResults: Skill[] = [];

  public switchTab(tab: 'issues' | 'rules' | 'skills' | 'audit' | 'metrics' | 'checklist'): void {
    this.activeTab = tab;
    this.updateHtml();
  }

  constructor(
    private findingStore: FindingStore,
    private storageManager: AuditStorageManager,
    private configManager: ConfigurationManager,
    private engine?: RuleEngine,
    projectContext?: ProjectContext
  ) {
    this.recommendationEngine = new RecommendationEngine();
    this.projectContext = projectContext;

    const unsubStore = this.findingStore.onDidChange(() => {
      this.refresh();
    });
    this.disposables.push({ dispose: unsubStore });

    const unsubConfig = this.configManager.onDidChange(() => {
      this.refresh();
    });
    this.disposables.push(unsubConfig);
  }

  public dispose(): void {
    this.disposeView();
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch (err) {
        console.error('[CraftLens] Error disposing sidebar subscription:', err);
      }
    }
    this.disposables = [];
  }

  private disposeView(): void {
    for (const d of this.viewDisposables) {
      try {
        d.dispose();
      } catch (err) {
        console.error('[CraftLens] Error disposing webview disposable:', err);
      }
    }
    this.viewDisposables = [];
  }

  public setEngine(engine: RuleEngine): void {
    this.engine = engine;
  }

  public setProjectContext(context: ProjectContext): void {
    this.projectContext = context;
  }

  public setFilter(filter: string): void {
    this.issueFilter = filter;
    this.updateHtml();
  }

  public getFilter(): string {
    return this.issueFilter;
  }

  public getStorageManager(): AuditStorageManager {
    return this.storageManager;
  }

  private async handleAddEvent(message: any): Promise<void> {
    if (!message) {
      await vscode.commands.executeCommand('craftlens.addSkill');
      return;
    }

    // 1. If payload specifies a skill or skillId
    const skillId =
      message.skillId ||
      message.id ||
      (typeof message.skill === 'string' ? message.skill : message.skill?.id);
    if (skillId) {
      const activate = message.active ?? message.activateImmediately ?? false;
      await vscode.commands.executeCommand('craftlens.installSkill', skillId, activate);
      this.refresh();
      return;
    }

    // 2. If payload specifies a file path (e.g. user-uploaded Markdown skill)
    const filePath = message.filePath || message.path || message.file;
    if (filePath && typeof filePath === 'string') {
      try {
        const pkg = await this.engine?.getSkillManager().importSkill(
          { type: 'file', path: filePath },
          { activateImmediately: message.active ?? false }
        );
        if (pkg) {
          vscode.window.showInformationMessage(
            `CraftLens: Imported skill "${pkg.manifest.displayName || pkg.manifest.name}" v${pkg.manifest.version || '1.0.0'}.`
          );
          this.refresh();
          return;
        }
      } catch (importErr: any) {
        vscode.window.showErrorMessage(`Failed to import skill file: ${importErr?.message || importErr}`);
        return;
      }
    }

    // 3. If payload specifies a github repo/url
    const url = message.url || message.repository;
    if (url && typeof url === 'string') {
      try {
        const pkg = await this.engine?.getSkillManager().importSkill(
          { type: 'github', url },
          { activateImmediately: message.active ?? false }
        );
        if (pkg) {
          vscode.window.showInformationMessage(
            `CraftLens: Imported GitHub skill "${pkg.manifest.displayName || pkg.manifest.name}".`
          );
          this.refresh();
          return;
        }
      } catch (importErr: any) {
        vscode.window.showErrorMessage(`Failed to import GitHub skill: ${importErr?.message || importErr}`);
        return;
      }
    }

    // 4. Default: Open add skill workflow
    await vscode.commands.executeCommand('craftlens.addSkill', message);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.disposeView();
    this._view = webviewView;

    if (webviewView && typeof (webviewView as any).onDidDispose === 'function') {
      this.viewDisposables.push(
        (webviewView as any).onDidDispose(() => {
          this.disposeView();
          this._view = undefined;
        })
      );
    }

    webviewView.webview.options = {
      enableScripts: true,
    };

    const messageListener = webviewView.webview.onDidReceiveMessage(async (message: any) => {
      if (!message) return;
      const messageType = message.type || message.action || message.event || message.command;
      try {
        switch (messageType) {
          case 'add':
          case 'addSkill':
          case 'add-skill':
            await this.handleAddEvent(message);
            break;
          case 'switchTab':
            if (message.tab) {
              this.activeTab = message.tab;
              this.updateHtml();
            }
            break;

        case 'setRuleSource':
          if (message.mode) {
            this.ruleSourceMode = message.mode;
            this.activeTab = 'rules';
            if (this.engine) {
              const execMode = message.mode === 'user' ? 'custom' : message.mode;
              this.engine.setRuleExecutionMode(execMode);
            }
            this.updateHtml();
          }
          break;

        case 'setFilter':
          this.issueFilter = message.filter || 'all';
          this.updateHtml();
          break;

        case 'clearFilter':
          this.issueFilter = 'all';
          this.issueSearchQuery = '';
          this.updateHtml();
          break;

        case 'searchIssues':
          this.issueSearchQuery = (message.query || '').toLowerCase();
          this.updateHtml();
          break;

        case 'toggleFinding':
          if (message.findingId) {
            if (this.expandedFindingIds.has(message.findingId)) {
              this.expandedFindingIds.delete(message.findingId);
            } else {
              this.expandedFindingIds.add(message.findingId);
            }
            this.selectedFindingId = message.findingId;
            this.updateHtml();
          }
          break;

        case 'toggleCategory':
          if (message.category) {
            if (this.expandedCategories.has(message.category)) {
              this.expandedCategories.delete(message.category);
            } else {
              this.expandedCategories.add(message.category);
            }
            this.updateHtml();
          }
          break;

        case 'toggleUserRuleGroup':
          if (message.groupId) {
            if (this.expandedRuleGroups.has(message.groupId)) {
              this.expandedRuleGroups.delete(message.groupId);
            } else {
              this.expandedRuleGroups.add(message.groupId);
            }
            this.updateHtml();
          }
          break;

        case 'toggleUserRuleDetail':
          if (message.ruleId) {
            if (this.expandedRuleIds.has(message.ruleId)) {
              this.expandedRuleIds.delete(message.ruleId);
            } else {
              this.expandedRuleIds.add(message.ruleId);
            }
            this.updateHtml();
          }
          break;

        case 'toggleSkillExpand':
          if (message.skillId) {
            if (this.expandedSkills.has(message.skillId)) {
              this.expandedSkills.delete(message.skillId);
            } else {
              this.expandedSkills.add(message.skillId);
            }
            this.updateHtml();
          }
          break;

        case 'addUserRules':
        case 'add-user-rules':
          await vscode.commands.executeCommand('craftlens.addUserRules', message);
          break;

        case 'toggleUserRule':
          if (message.groupId && message.ruleId) {
            await vscode.commands.executeCommand('craftlens.toggleUserRule', message.groupId, message.ruleId);
          }
          break;

        case 'deleteUserRule':
          if (message.groupId && message.ruleId) {
            await vscode.commands.executeCommand('craftlens.deleteUserRule', message.groupId, message.ruleId);
          }
          break;

        case 'deleteUserRuleGroup':
          if (message.groupId) {
            await vscode.commands.executeCommand('craftlens.deleteUserRuleGroup', message.groupId);
          }
          break;

        case 'openInstance':
          if (message.findingId) {
            this.selectedFindingId = message.findingId;
            const target = this.findingStore.getFindingById(message.findingId) || message.findingId;
            await vscode.commands.executeCommand(
              'craftlens.openFindingLocation',
              target,
              message.instanceIndex ?? 0
            );
          } else if (message.filePath) {
            await vscode.commands.executeCommand(
              'craftlens.openFindingLocation',
              { filePath: message.filePath, line: message.line ?? 1 },
              0
            );
          }
          break;

        case 'applySuggestion':
          if (message.findingId !== undefined && message.suggestionIndex !== undefined) {
            await vscode.commands.executeCommand('craftlens.applySuggestion', message.findingId, message.suggestionIndex);
          }
          break;

        case 'copySuggestionFix':
          if (message.text) {
            await vscode.commands.executeCommand('craftlens.copySuggestionFix', message.text);
          }
          break;

        case 'suggestBetterDesign':
          if (message.findingId) {
            const rawFinding = this.findingStore.getFindingById(message.findingId);
            await vscode.commands.executeCommand('craftlens.suggestBetterDesign', rawFinding || message.findingId);
          }
          break;

        case 'previewFix':
          if (message.findingId) {
            const rawFinding = this.findingStore.getFindingById(message.findingId);
            if (rawFinding) {
              const docUri = vscode.Uri.file(rawFinding.location?.filePath || rawFinding.filePath || '');
              await vscode.commands.executeCommand('craftlens.previewDesignFix', docUri, rawFinding);
            }
          }
          break;

        case 'rejectFinding':
          if (message.findingId) {
            const rawFinding = this.findingStore.getFindingById(message.findingId);
            await vscode.commands.executeCommand('craftlens.rejectFinding', rawFinding || message.findingId);
          }
          break;

        case 'runAudit':
          await vscode.commands.executeCommand('craftlens.scanCurrentFile');
          break;

        case 'toggleSkill': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            await vscode.commands.executeCommand('craftlens.toggleSkill', sid, message.active);
            this.updateHtml();
          }
          break;
        }

        case 'activateSkill': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            this.installingSkills.add(sid);
            this.updateHtml();
            try {
              const existing = this.engine?.getSkillManager().getSkill(sid);
              if (existing) {
                await vscode.commands.executeCommand('craftlens.toggleSkill', sid, true);
              } else {
                await vscode.commands.executeCommand('craftlens.installSkill', sid, true);
              }
            } finally {
              this.installingSkills.delete(sid);
              this.updateHtml();
            }
          }
          break;
        }

        case 'installSkill': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            this.installingSkills.add(sid);
            this.updateHtml();
            try {
              await vscode.commands.executeCommand('craftlens.installSkill', sid, false);
            } finally {
              this.installingSkills.delete(sid);
              this.updateHtml();
            }
          }
          break;
        }

        case 'deleteSkill': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            await vscode.commands.executeCommand('craftlens.deleteSkill', sid);
            this.updateHtml();
          }
          break;
        }

        case 'openSkillSource': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            await vscode.commands.executeCommand('craftlens.openSkillSource', sid);
          }
          break;
        }

        case 'toggleSkillDetails': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            this.selectedSkillDetails = this.selectedSkillDetails === sid ? null : sid;
            this.updateHtml();
          }
          break;
        }

        case 'toggleShowMoreRecommendations':
          this.showAllRecommendations = !this.showAllRecommendations;
          this.updateHtml();
          break;

        case 'searchSkills':
          this.skillSearchQuery = message.query || '';
          {
            const allInstalled = this.engine?.getSkillManager().getAllSkillsAsSkills() || [];
            const res = await this.discoveryService.searchSkills(this.skillSearchQuery, {
              installedSkills: allInstalled,
              category: this.selectedSkillCategory,
            });
            this.searchResults = res.skills;
            this.isOfflineMode = res.isOfflineFallback;
            this.updateHtml();
          }
          break;

        case 'selectSkillCategory':
          this.selectedSkillCategory = message.category || 'all';
          {
            const allInstalled = this.engine?.getSkillManager().getAllSkillsAsSkills() || [];
            const res = await this.discoveryService.searchSkills(this.skillSearchQuery, {
              installedSkills: allInstalled,
              category: this.selectedSkillCategory,
            });
            this.searchResults = res.skills;
            this.updateHtml();
          }
          break;

        case 'activateRecommendedSkill': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            await vscode.commands.executeCommand('craftlens.installSkill', sid, true);
            this.updateHtml();
          }
          break;
        }

        case 'openAiConfig':
          vscode.window.showInformationMessage(
            'CraftLens AI Fix Suggestions (Optional BYOK): Configure OpenAI, Anthropic, Gemini, or Ollama. Keys are stored securely in VS Code SecretStorage.'
          );
          break;

        case 'filterRuleCategory':
          this.ruleCategoryFilter = message.category || 'all';
          this.updateHtml();
          break;

        case 'searchRules':
          this.ruleSearchQuery = (message.query || '').toLowerCase();
          this.updateHtml();
          break;

        case 'openChecklist':
          await vscode.commands.executeCommand('craftlens.openMasterChecklist');
          break;

        case 'toggleChecklistCriterion':
          if (message.id) {
            this.storageManager.updateCriterionChecked(message.id, Boolean(message.checked));
            this.updateHtml();
          }
          break;

        case 'toggleChecklistIssues':
          if (message.criterionId) {
            if (this.expandedChecklistCriterionId === message.criterionId) {
              this.expandedChecklistCriterionId = null;
            } else {
              this.expandedChecklistCriterionId = message.criterionId;
            }
            this.updateHtml();
          }
          break;

        case 'refresh':
          this.refresh();
          break;
      }
    } catch (err: any) {
      console.error('[CraftLens] Event handling failure:', {
        eventName: messageType,
        eventSource: 'webview.craftlens.sidebar',
        handlerName: 'onDidReceiveMessage',
        relevantPayloadKeys: message && typeof message === 'object' ? Object.keys(message) : [],
        errorMessage: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  });

  this.viewDisposables.push(messageListener);
  this.updateHtml();
}

public refresh(): void {
  if (this._view) {
    this.updateHtml();
  }
}

public setSelectedFinding(id: string | null): void {
  this.selectedFindingId = id;
  if (id) {
    this.expandedFindingIds.add(id);
  }
  if (this._view) {
    this.updateHtml();
  }
}

private updateHtml(): void {
  if (!this._view) return;
  this._view.webview.html = this.renderHtml();
}

  private renderHtml(): string {
    const canonicalFindings = this.findingStore.getCanonicalFindings();
    const auditState = this.findingStore.getAuditState();
    const countsByCat = this.findingStore.getCountsByCanonicalCategory();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const projectName = workspaceFolders && workspaceFolders.length > 0
      ? path.basename(workspaceFolders[0].uri.fsPath)
      : 'workspace';

    const allSkills: SkillPackage[] = this.engine
      ? this.engine.getSkillManager().getRegistry().getAllSkills()
      : [];
    const allRules: Rule[] = this.engine ? this.engine.getCanonicalEngine().getRules() : [];
    const ruleStats = this.engine ? this.engine.getRuleStats() : {
      combined: allRules.length,
      builtin: allRules.length,
      user: 0,
      imported: 0,
      skills: allSkills.length,
    };

    const totalIssues = canonicalFindings.length;
    const totalInstances = canonicalFindings.reduce((acc, f) => acc + (f.instances?.length || 1), 0);

    // Calculate semantic counts (Section 1)
    const countsBySemanticSev = {
      error: 0,
      warning: 0,
      moderate: 0,
      info: 0,
    };
    for (const f of canonicalFindings) {
      const s = toSemanticSeverity(f.severity);
      countsBySemanticSev[s]++;
    }

    // Filter findings
    let filteredFindings = canonicalFindings;
    if (this.issueSearchQuery) {
      filteredFindings = filteredFindings.filter(f =>
        (f.title || f.problemTitle || '').toLowerCase().includes(this.issueSearchQuery) ||
        (f.summary || f.message || '').toLowerCase().includes(this.issueSearchQuery) ||
        (f.ruleId || '').toLowerCase().includes(this.issueSearchQuery) ||
        (f.why && f.why.toLowerCase().includes(this.issueSearchQuery)) ||
        (f.instances && f.instances.some(i => i.filePath?.toLowerCase().includes(this.issueSearchQuery)))
      );
    }

    if (this.issueFilter !== 'all') {
      if (['error', 'warning', 'moderate', 'info'].includes(this.issueFilter)) {
        filteredFindings = filteredFindings.filter(f => toSemanticSeverity(f.severity) === this.issueFilter);
      } else if (['critical', 'high', 'medium', 'low', 'suggestion'].includes(this.issueFilter)) {
        filteredFindings = filteredFindings.filter(f => f.severity === this.issueFilter);
      } else if (['ui-ux', 'content', 'accessibility', 'code', 'security', 'performance'].includes(this.issueFilter)) {
        filteredFindings = filteredFindings.filter(f => f.category === this.issueFilter);
      } else if (this.issueFilter === 'hasFix') {
        filteredFindings = filteredFindings.filter(f => f.autoFixAvailable || Boolean(f.fix || f.designFix));
      }
    }

    const checklistAudit = this.storageManager.getOrInitAudit(this.projectContext, canonicalFindings);
    const checklistItems = checklistAudit?.items || [];
    const checklistCriteriaCount = checklistItems.length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CraftLens</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #18181b);
      --fg: var(--vscode-sideBar-foreground, var(--vscode-foreground, #cccccc));
      --header-fg: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground, #ffffff));
      --muted: var(--vscode-descriptionForeground, #858585);
      --border: var(--vscode-sideBar-border, var(--vscode-panel-border, #27272a));
      --border-subtle: var(--vscode-sideBar-border, var(--vscode-panel-border, #27272a));
      --surface: var(--vscode-editor-background, #18181b);
      --surface-raised: var(--vscode-input-background, #202024);
      --surface-hover: var(--vscode-list-hoverBackground, #2a2d2e);
      --font-mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      --radius-sm: 2px;
      --radius-md: 3px;
      --control-height: 24px;

      /* Semantic Severities (Section 1) */
      --sev-error: #ef4444;
      --sev-warning: #eab308;
      --sev-moderate: #f97316;
      --sev-info: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: 12px;
      color: var(--fg);
      background: var(--bg);
      line-height: 1.4;
      padding-bottom: 24px;
    }

    .top-header {
      padding: 8px 12px 6px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .brand-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--header-fg);
    }
    .workspace-name {
      font-size: 10.5px;
      color: var(--muted);
      max-width: 130px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .headline-stats {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--header-fg);
      margin-bottom: 6px;
    }
    .health-stat {
      font-size: 10.5px;
      font-weight: 500;
      color: var(--muted);
      margin-left: 6px;
    }

    /* Rule Sources Selector (Section 5 & 9) */
    .rule-modes-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--border-subtle);
      font-size: 10px;
    }
    .rule-modes-group {
      display: flex;
      gap: 3px;
    }
    .rule-mode-btn {
      padding: 2px 7px;
      font-size: 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      border: 1px solid var(--vscode-button-border, var(--border));
      color: var(--vscode-button-secondaryForeground, var(--muted));
      font-weight: 500;
    }
    .rule-mode-btn:hover {
      color: var(--vscode-button-secondaryForeground, var(--fg));
      background: var(--vscode-button-secondaryHoverBackground, var(--surface-hover));
    }
    .rule-mode-btn.active {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #ffffff);
      border-color: transparent;
      font-weight: 600;
    }

    /* Semantic Severity Bar (Section 1) */
    .severity-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-top: 6px;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .sev-indicator {
      display: flex;
      align-items: center;
      cursor: pointer;
      padding: 2px 5px;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
    }
    .sev-indicator:hover { background: var(--surface-hover); }
    .sev-indicator.active {
      background: var(--surface-raised);
      border-color: var(--border);
    }

    /* Primary Navigation */
    .nav-bar {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .nav-btn {
      flex: 1;
      padding: 6px 4px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--muted);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .nav-btn:hover { color: var(--fg); }
    .nav-btn.active {
      color: var(--header-fg);
      border-bottom-color: var(--vscode-panelTitle-activeBorder, var(--vscode-activityBar-foreground, #007acc));
    }
    .nav-count {
      font-family: var(--font-mono);
      font-size: 9px;
      padding: 1px 4px;
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
    }

    .filter-toolbar {
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .search-input {
      width: 100%;
      padding: 3px 6px;
      background: var(--vscode-input-background, #1e1e1e);
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: var(--radius-sm);
      color: var(--vscode-input-foreground, var(--fg));
      font-size: 11px;
      margin-bottom: 6px;
      outline: none;
    }
    .search-input:focus { border-color: var(--vscode-focusBorder, #007acc); }
    .quick-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .filter-tag {
      padding: 2px 6px;
      font-size: 9.5px;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      color: var(--muted);
    }
    .filter-tag:hover { color: var(--fg); background: var(--surface-hover); }
    .filter-tag.active {
      background: var(--vscode-list-activeSelectionBackground, #04395e);
      color: var(--vscode-list-activeSelectionForeground, #ffffff);
      border-color: var(--vscode-focusBorder, #007acc);
      font-weight: 600;
    }

    /* Finding Row & Section Structure */
    .cat-group { margin-bottom: 1px; }
    .cat-header {
      padding: 4px 12px;
      background: var(--surface);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--muted);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .finding-card {
      padding: 6px 12px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg);
      transition: background 0.1s ease;
    }
    .finding-card:hover { background: var(--surface-hover); }
    .finding-card.selected {
      background: var(--surface-raised);
      border-left: 2px solid var(--vscode-focusBorder, #007acc);
    }

    /* Requirement 5 Hierarchy: [SEVERITY] -> Title -> Supporting Info */
    .finding-header-row {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      cursor: pointer;
      margin-bottom: 3px;
    }
    .finding-sev-row {
      display: flex;
      align-items: center;
      margin-bottom: 1px;
    }
    .finding-title-row {
      display: flex;
      align-items: baseline;
      width: 100%;
    }
    .finding-title-text {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--header-fg);
      line-height: 1.35;
    }
    .finding-support-info {
      margin-top: 2px;
    }
    .finding-instance-count-label {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 3px;
      font-family: var(--font-mono, monospace);
    }
    .finding-location-single {
      margin-bottom: 3px;
    }
    .instance-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10.5px;
      line-height: 1.4;
    }
    .instance-idx {
      color: var(--muted);
      font-family: var(--font-mono, monospace);
      font-weight: 600;
      font-size: 10px;
    }
    .finding-instances-tree {
      margin: 2px 0 6px 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sev-badge {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 1px 5px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
    }
    .sev-badge.error { background: rgba(239, 68, 68, 0.18); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); }
    .sev-badge.warning { background: rgba(234, 179, 8, 0.18); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.4); }
    .sev-badge.moderate { background: rgba(249, 115, 22, 0.18); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.4); }
    .sev-badge.info { background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); }

    .finding-location-link {
      font-family: var(--font-mono);
      font-size: 10.5px;
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      display: inline-block;
      text-decoration: none;
    }
    .finding-location-link:hover {
      text-decoration: underline;
      color: var(--vscode-textLink-activeForeground, #3794ff);
    }

    .code-snippet-box {
      background: var(--vscode-textCodeBlock-background, var(--surface-raised));
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 4px 6px;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--vscode-editor-foreground, var(--fg));
      margin-bottom: 4px;
      overflow-x: auto;
      white-space: pre;
    }

    .token-callout {
      padding: 3px 6px;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-left: 2px solid var(--vscode-textLink-foreground, #3794ff);
      border-radius: var(--radius-sm);
      font-size: 10px;
      color: var(--fg);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .finding-explanation-pane {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--border);
    }
    .explanation-item { margin-bottom: 6px; }
    .explanation-heading {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 2px;
    }
    .explanation-text {
      font-size: 10.5px;
      color: var(--fg);
      line-height: 1.4;
    }

    /* Suggestions List (Section 3 & 21) */
    .suggestions-block {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed var(--border);
    }
    .suggestions-header {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--header-fg);
      margin-bottom: 6px;
    }
    .suggestion-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 6px 8px;
      margin-bottom: 6px;
    }
    .sug-title-row {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10.5px;
      font-weight: 600;
      color: var(--header-fg);
      margin-bottom: 2px;
    }
    .sug-icon {
      font-size: 11px;
      color: var(--vscode-textLink-foreground, #3794ff);
    }
    .sug-why {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 5px;
      line-height: 1.35;
    }
    .sug-diff {
      background: var(--surface-raised);
      border-left: 2px solid var(--vscode-focusBorder, #007acc);
      padding: 3px 6px;
      font-family: var(--font-mono);
      font-size: 9.5px;
      margin-bottom: 5px;
      color: var(--vscode-editor-foreground, var(--fg));
      white-space: pre-wrap;
    }
    .sug-actions {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    /* Buttons */
    .btn {
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground, #313131);
      color: var(--vscode-button-secondaryForeground, #cccccc);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      line-height: 1.35;
      user-select: none;
    }
    .btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
      color: var(--vscode-button-secondaryForeground, #ffffff);
    }
    .btn:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007acc); outline-offset: 1px; }
    .btn-primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #ffffff);
      border-color: var(--vscode-button-border, transparent);
      font-weight: 600;
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    .btn-quiet {
      background: transparent;
      border-color: transparent;
      color: var(--vscode-foreground, #cccccc);
    }
    .btn-quiet:hover {
      color: var(--vscode-foreground, #ffffff);
      background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
    }

    /* User Rules Manager UI (Section 6, 7, 8) */
    .user-rules-pane { padding: 8px 12px; }
    .user-group-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      margin-bottom: 8px;
      overflow: hidden;
    }
    .user-group-header {
      padding: 6px 10px;
      background: var(--surface-raised);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      font-weight: 600;
      font-size: 11px;
    }
    .user-group-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .user-rule-item {
      padding: 8px 10px;
      border-top: 1px solid var(--border-subtle);
    }
    .user-rule-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      margin-bottom: 3px;
    }
    .user-rule-name {
      font-weight: 600;
      font-size: 11px;
      color: var(--header-fg);
    }
    .user-rule-details {
      margin-top: 4px;
      padding: 6px;
      background: var(--surface-raised);
      border-radius: var(--radius-sm);
      font-size: 10px;
    }
    .user-rule-meta-row {
      display: flex;
      gap: 12px;
      color: var(--muted);
      margin-top: 4px;
      font-size: 9.5px;
    }

    /* Skills Manager (Polished Dev Tool Layout) */
    .skills-pane { padding: 8px 10px; }
    .skills-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .skills-header-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--header-fg);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .skills-count-subtle {
      font-size: 10px;
      font-weight: 500;
      color: var(--muted);
    }
    .skill-conflict-banner {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      margin-bottom: 12px;
    }
    .skill-conflict-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #f59e0b;
      margin-bottom: 2px;
    }
    .skill-conflict-desc {
      font-size: 10px;
      color: var(--fg);
      line-height: 1.35;
    }
    .skill-group-section {
      margin-bottom: 14px;
    }
    .skill-group-header {
      font-size: 10px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .skill-empty-hint {
      font-size: 10px;
      color: var(--muted);
      font-style: italic;
      padding: 4px 6px;
    }
    .skill-rows-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .skill-row {
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      background: var(--surface);
      transition: all 0.15s ease;
      overflow: hidden;
    }
    .skill-row:hover {
      border-color: var(--border);
      background: var(--surface-raised);
    }
    .skill-row.active-skill {
      border-color: rgba(16, 185, 129, 0.25);
    }
    .skill-row-main {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
    }
    .skill-checkbox-wrapper {
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }
    .skill-checkbox {
      appearance: auto;
      -webkit-appearance: auto;
      cursor: pointer;
      accent-color: var(--vscode-button-background, #0e639c);
      width: 14px;
      height: 14px;
      margin: 0;
      flex-shrink: 0;
    }
    .skill-row-info {
      min-width: 0;
      flex: 1;
      cursor: pointer;
    }
    .skill-row-name-line {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: nowrap;
    }
    .skill-row-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--header-fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .skill-version-tag {
      font-size: 9px;
      font-family: var(--font-mono);
      color: var(--muted);
      background: var(--surface-raised);
      padding: 1px 4px;
      border-radius: var(--radius-sm);
      white-space: nowrap;
    }
    .skill-source-tag {
      font-size: 8.5px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    .skill-row-desc {
      font-size: 9.5px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }
    .skill-row-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .skill-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: var(--control-height, 24px);
      height: var(--control-height, 24px);
      min-width: var(--control-height, 24px);
      padding: 0 5px;
      border-radius: var(--radius-sm, 2px);
      font-size: 11px;
      font-weight: 500;
      line-height: 1;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground, #313131);
      color: var(--vscode-button-secondaryForeground, #cccccc);
      cursor: pointer;
      user-select: none;
      flex-shrink: 0;
      box-sizing: border-box;
      vertical-align: middle;
    }
    .skill-icon-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
      color: var(--vscode-button-secondaryForeground, #ffffff);
    }
    .skill-icon-btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 1px;
    }
    .skill-icon-btn.delete-btn:hover {
      color: var(--vscode-errorForeground, #ef4444);
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.35);
    }

    /* Fixed Activate Button & State Variants (Section 5 & 6) */
    .btn-skill-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      white-space: nowrap;
      min-height: var(--control-height, 24px);
      height: var(--control-height, 24px);
      padding: 0 8px;
      font-size: 10.5px;
      font-weight: 500;
      border-radius: var(--radius-sm, 2px);
      line-height: 1;
      border: 1px solid transparent;
      cursor: pointer;
      user-select: none;
      flex-shrink: 0;
      box-sizing: border-box;
      vertical-align: middle;
    }
    .btn-skill-action.state-install {
      background: var(--vscode-button-secondaryBackground, #313131);
      color: var(--vscode-button-secondaryForeground, #cccccc);
      border: 1px solid var(--vscode-button-border, var(--border));
    }
    .btn-skill-action.state-install:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
      color: var(--vscode-button-secondaryForeground, #ffffff);
    }
    .btn-skill-action.state-installing {
      background: var(--vscode-button-secondaryBackground, #313131);
      color: var(--muted);
      cursor: wait;
    }
    .btn-skill-action.state-activate {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #ffffff);
      font-weight: 600;
    }
    .btn-skill-action.state-activate:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
    .btn-skill-action.state-active {
      background: transparent;
      color: var(--vscode-testing-iconPassed, #73c991);
      border-color: transparent;
    }
    .btn-skill-action.state-update {
      background: var(--vscode-button-secondaryBackground, #313131);
      color: var(--vscode-editorWarning-foreground, #cca700);
      border-color: var(--vscode-button-border, transparent);
    }

    /* Shared Compact Control Sizing */
    .btn-control {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      white-space: nowrap;
      min-height: var(--control-height, 24px);
      height: var(--control-height, 24px);
      padding: 0 8px;
      font-size: 11px;
      font-weight: 500;
      border-radius: var(--radius-sm, 2px);
      line-height: 1;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground, #313131);
      color: var(--vscode-button-secondaryForeground, #cccccc);
      cursor: pointer;
      user-select: none;
      flex-shrink: 0;
      box-sizing: border-box;
      vertical-align: middle;
    }
    .btn-control:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
      color: var(--vscode-button-secondaryForeground, #ffffff);
    }
    .btn-control:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 1px;
    }
    .btn-control.btn-primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #ffffff);
      border-color: transparent;
      font-weight: 600;
    }
    .btn-control.btn-primary:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }

    /* Checklist View */
    .checklist-container {
      padding: 8px 12px;
    }
    .checklist-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
      gap: 8px;
    }
    .checklist-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checklist-heading {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--header-fg);
    }
    .checklist-count-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      color: var(--muted);
      border: 1px solid var(--border);
    }
    .checklist-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .checklist-item-wrapper {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .checklist-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 6px;
      border-radius: var(--radius-sm);
      transition: background 0.1s ease;
      gap: 6px;
    }
    .checklist-item-row:hover {
      background: var(--surface-hover);
    }
    .checklist-item-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }
    .checklist-item-label {
      display: flex;
      align-items: center;
      cursor: pointer;
      min-width: 0;
      user-select: none;
    }
    .checklist-checkbox {
      appearance: auto;
      -webkit-appearance: auto;
      cursor: pointer;
      accent-color: var(--vscode-button-background, #0e639c);
      width: 14px;
      height: 14px;
      margin: 0;
      flex-shrink: 0;
    }
    .checklist-checkbox:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 1px;
    }
    .checklist-item-title {
      font-size: 11.5px;
      line-height: 1.35;
      color: var(--fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .checklist-item-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .checklist-issue-count {
      font-family: var(--font-mono, monospace);
      font-size: 10px;
      color: var(--muted);
      white-space: nowrap;
    }
    .checklist-user-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--vscode-editorWarning-foreground, #cca700);
      flex-shrink: 0;
    }
    .checklist-view-issues-btn {
      background: var(--vscode-button-secondaryBackground, #313131);
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-button-secondaryForeground, #cccccc);
      font-size: 10.5px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      line-height: 1.35;
      white-space: nowrap;
    }
    .checklist-view-issues-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
      color: var(--vscode-button-secondaryForeground, #ffffff);
    }

    /* 4-State checklist styling */
    .checklist-item-row.state-not-detected .checklist-item-title {
      color: var(--fg);
    }
    .checklist-item-row.state-not-detected .checklist-issue-count {
      color: var(--muted);
    }

    .checklist-item-row.state-issues .checklist-item-title {
      color: var(--vscode-errorForeground, #ef4444);
    }
    .checklist-item-row.state-issues .checklist-issue-count {
      color: var(--vscode-errorForeground, #ef4444);
      font-weight: 600;
    }
    .checklist-item-row.state-issues .checklist-checkbox {
      accent-color: var(--vscode-errorForeground, #ef4444);
    }

    .checklist-item-row.state-acknowledged .checklist-item-title {
      color: var(--vscode-editorWarning-foreground, #eab308);
    }
    .checklist-item-row.state-acknowledged .checklist-issue-count {
      color: var(--vscode-editorWarning-foreground, #eab308);
      font-weight: 600;
    }
    .checklist-item-row.state-acknowledged .checklist-checkbox {
      accent-color: var(--vscode-editorWarning-foreground, #eab308);
    }

    .checklist-item-row.state-fixed .checklist-item-title {
      color: var(--vscode-testing-iconPassed, #22c55e);
    }
    .checklist-item-row.state-fixed .checklist-issue-count {
      color: var(--vscode-testing-iconPassed, #22c55e);
    }
    .checklist-item-row.state-fixed .checklist-checkbox {
      accent-color: var(--vscode-testing-iconPassed, #22c55e);
    }

    /* Inline Issues Panel */
    .checklist-issues-panel {
      margin: 2px 0 6px 8px;
      padding: 6px 8px;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-left: 2px solid var(--vscode-focusBorder, #007acc);
      border-radius: var(--radius-sm);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .checklist-issues-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 3px;
      border-bottom: 1px solid var(--border);
    }
    .checklist-issues-panel-title {
      font-size: 10px;
      font-weight: 600;
      color: var(--header-fg);
      font-family: var(--font-mono, monospace);
    }
    .checklist-issues-empty {
      font-size: 11px;
      color: var(--muted);
      font-style: italic;
      padding: 4px 0;
    }
    .checklist-issues-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* Recommended Cards */
    .rec-skills-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .rec-skill-row {
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: var(--radius-sm);
      padding: 6px 8px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .rec-skill-content {
      min-width: 0;
      flex: 1;
    }
    .rec-skill-header-line {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rec-skill-name {
      font-size: 11px;
      font-weight: 700;
      color: #93c5fd;
    }
    .rec-skill-reason {
      font-size: 10px;
      color: var(--fg);
      margin-top: 2px;
      line-height: 1.35;
    }
    .rec-skill-caps {
      display: flex;
      gap: 4px;
      margin-top: 5px;
      flex-wrap: wrap;
    }
    .rec-cap-tag {
      font-size: 9px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--muted);
      padding: 1px 5px;
      border-radius: 3px;
    }
    .rec-skills-footer {
      margin-top: 6px;
      display: flex;
      justify-content: center;
    }
    .rec-expand-btn {
      font-size: 10px;
      padding: 3px 8px;
    }

    /* Skill Details */
    .skill-details-card {
      padding: 8px 10px;
      background: rgba(0, 0, 0, 0.15);
      border-top: 1px solid var(--border-subtle);
      font-size: 9.5px;
    }
    .skill-details-meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 12px;
      margin-bottom: 6px;
    }
    .meta-label {
      color: var(--muted);
    }
    .meta-val {
      color: var(--fg);
      font-weight: 500;
    }
    .skill-caps-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: var(--muted);
    }
    .skill-safety-status {
      margin-top: 6px;
      padding: 4px 6px;
      background: rgba(16, 185, 129, 0.08);
      border-radius: 3px;
      color: #10b981;
      font-size: 9px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .skill-details-actions {
      margin-top: 8px;
      display: flex;
      gap: 6px;
    }

    /* Discovery & Search */
    .skill-search-box {
      margin-bottom: 6px;
    }
    .skill-search-input {
      width: 100%;
      box-sizing: border-box;
      background: var(--input-bg);
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 5px 8px;
      font-size: 10.5px;
      border-radius: var(--radius-sm);
      outline: none;
      transition: border-color 0.15s ease;
    }
    .skill-search-input:focus {
      border-color: var(--accent);
    }
    .skill-category-chips {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .chip-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      color: var(--muted);
      font-size: 8.5px;
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s ease;
    }
    .chip-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--header-fg);
    }
    .chip-btn.active {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      border-color: rgba(59, 130, 246, 0.4);
      font-weight: 600;
    }
    .offline-banner {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.25);
      color: #f59e0b;
      font-size: 9.5px;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      margin-bottom: 6px;
    }
    .discovery-results-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .discovery-skill-row {
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      background: var(--surface);
      padding: 8px 10px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      transition: all 0.15s ease;
    }
    .discovery-skill-row:hover {
      background: var(--surface-raised);
      border-color: var(--border);
    }
    .discovery-skill-info {
      min-width: 0;
      flex: 1;
    }
    .discovery-skill-title-line {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .discovery-skill-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--header-fg);
    }
    .discovery-meta-line {
      font-size: 9px;
      color: var(--muted);
    }
    .stars-gold {
      color: #f59e0b;
    }
    .discovery-skill-desc {
      font-size: 9.5px;
      color: var(--muted);
      margin-top: 2px;
      line-height: 1.35;
    }
    .discovery-meta-row {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .compat-status-tag {
      font-size: 8.5px;
      padding: 1px 4px;
      border-radius: 2px;
    }
    .compat-status-tag.compatible {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
    }
    .compat-status-tag.partial {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.1);
    }
    .safety-warn-tag {
      font-size: 8.5px;
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.1);
      padding: 1px 4px;
      border-radius: 2px;
    }

    /* Reduced Motion (Section 23) */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    /* Combined Stats Pane (Section 9) */
    .combined-stats-pane {
      padding: 10px 12px;
    }
    .stats-summary-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px;
      margin-bottom: 10px;
    }
    .stats-big-number {
      font-size: 20px;
      font-weight: 700;
      color: var(--header-fg);
      margin-bottom: 4px;
    }
    .stats-breakdown-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 10.5px;
    }
    .stats-breakdown-row:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <!-- Top Workspace Summary -->
  <header class="top-header">
    <div class="brand-row">
      <span class="brand-title">CraftLens</span>
      <span class="workspace-name" title="${projectName}">${projectName}</span>
    </div>
    <div class="headline-stats">
      <span>${totalIssues} finding${totalIssues === 1 ? '' : 's'} · ${totalInstances} instance${totalInstances === 1 ? '' : 's'}</span>
      <span class="health-stat">(Score ${auditState.score ?? 100})</span>
    </div>

    <!-- Rule Sources Selector (Section 5, 8, 9) -->
    <div class="rule-modes-bar">
      <span style="color: var(--muted); font-weight: 600;">Rule Sources:</span>
      <div class="rule-modes-group">
        <button class="rule-mode-btn ${this.ruleSourceMode === 'builtin' ? 'active' : ''}" data-action="select-rule-source" data-mode="builtin" onclick="selectRuleSource('builtin')">CraftLens</button>
        <button class="rule-mode-btn ${this.ruleSourceMode === 'user' ? 'active' : ''}" data-action="select-rule-source" data-mode="user" onclick="selectRuleSource('user')" title="User Only">User Only</button>
        <button class="rule-mode-btn ${this.ruleSourceMode === 'combined' ? 'active' : ''}" data-action="select-rule-source" data-mode="combined" onclick="selectRuleSource('combined')">Combined</button>
      </div>
    </div>

    <!-- Semantic Severity Bar (Section 1) -->
    <div class="severity-bar">
      <div class="sev-indicator ${this.issueFilter === 'error' ? 'active' : ''}" data-action="set-filter" data-filter="error" onclick="setFilter('error')">
        <span style="color: var(--sev-error);">ERR ${countsBySemanticSev.error}</span>
      </div>
      <div class="sev-indicator ${this.issueFilter === 'warning' ? 'active' : ''}" data-action="set-filter" data-filter="warning" onclick="setFilter('warning')">
        <span style="color: var(--sev-warning);">WARN ${countsBySemanticSev.warning}</span>
      </div>
      <div class="sev-indicator ${this.issueFilter === 'moderate' ? 'active' : ''}" data-action="set-filter" data-filter="moderate" onclick="setFilter('moderate')">
        <span style="color: var(--sev-moderate);">MOD ${countsBySemanticSev.moderate}</span>
      </div>
      <div class="sev-indicator ${this.issueFilter === 'info' ? 'active' : ''}" data-action="set-filter" data-filter="info" onclick="setFilter('info')">
        <span style="color: var(--sev-info);">INFO ${countsBySemanticSev.info}</span>
      </div>
    </div>

    ${this.issueFilter !== 'all' ? `
      <div style="padding: 4px 12px; background: rgba(59, 130, 246, 0.1); border-bottom: 1px solid var(--border); font-size: 10px; display: flex; justify-content: space-between; align-items: center;">
        <span>Filter active: <strong>${escapeHtml(String(this.issueFilter || '').toUpperCase())}</strong></span>
        <span style="cursor: pointer; color: #60a5fa;" data-action="clear-filter" onclick="clearFilter()">Clear</span>
      </div>
    ` : ''}
  </header>

  <!-- Primary Tab Switcher -->
  <nav class="nav-bar">
    <button class="nav-btn ${this.activeTab === 'issues' || this.activeTab === 'audit' ? 'active' : ''}" onclick="switchTab('audit')" data-action="switch-tab" data-tab="audit" data-tab-name="ISSUES">
      AUDIT <span class="nav-count">${totalIssues}</span>
    </button>
    <button class="nav-btn ${this.activeTab === 'checklist' ? 'active' : ''}" onclick="switchTab('checklist')" data-action="switch-tab" data-tab="checklist">
      CHECKLIST <span class="nav-count">${checklistCriteriaCount}</span>
    </button>
    <button class="nav-btn ${this.activeTab === 'skills' ? 'active' : ''}" onclick="switchTab('skills')" data-action="switch-tab" data-tab="skills">
      SKILLS <span class="nav-count">${allSkills.length}</span>
    </button>
    <button class="nav-btn ${this.activeTab === 'rules' ? 'active' : ''}" onclick="switchTab('rules')" data-action="switch-tab" data-tab="rules">
      RULES <span class="nav-count">${this.ruleSourceMode === 'builtin' ? ruleStats.builtin : this.ruleSourceMode === 'user' ? (ruleStats.user + ruleStats.imported) : ruleStats.combined}</span>
    </button>
    <button class="nav-btn ${this.activeTab === 'metrics' ? 'active' : ''}" onclick="switchTab('metrics')" data-action="switch-tab" data-tab="metrics">
      METRICS
    </button>
  </nav>

  <!-- Main View Area -->
  <main class="content-area">
    ${(this.activeTab === 'issues' || this.activeTab === 'audit') ? this.renderIssuesView(filteredFindings, totalIssues) : ''}
    ${this.activeTab === 'checklist' ? this.renderChecklistView(checklistItems, canonicalFindings) : ''}
    ${this.activeTab === 'skills' ? this.renderSkillsView(allSkills) : ''}
    ${this.activeTab === 'rules' ? this.renderRulesView(allRules, ruleStats) : ''}
    ${this.activeTab === 'metrics' ? this.renderMetricsView() : ''}
  </main>

  <script>
    (function() {
      const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : {
        postMessage: function(msg) {}
      };

      function post(type, payload) {
        try {
          vscode.postMessage(Object.assign({ type: type }, payload || {}));
        } catch (err) {
          console.error('[CraftLens] webview postMessage failed:', type, err);
        }
      }

      window.switchTab = function(tab) { post('switchTab', { tab: tab }); };
      window.selectRuleSource = function(mode) { post('setRuleSource', { mode: mode }); };
      window.setFilter = function(filter) { post('setFilter', { filter: filter }); };
      window.clearFilter = function() { post('clearFilter'); };
      window.onSearch = function(input) { post('searchIssues', { query: input ? input.value : '' }); };
      window.toggleFinding = function(findingId) { post('toggleFinding', { findingId: findingId }); };
      window.toggleCategory = function(category) { post('toggleCategory', { category: category }); };
      window.toggleUserRuleGroup = function(groupId) { post('toggleUserRuleGroup', { groupId: groupId }); };
      window.toggleUserRuleDetail = function(ruleId) { post('toggleUserRuleDetail', { ruleId: ruleId }); };
      window.toggleSkillExpand = function(skillId) { post('toggleSkillExpand', { skillId: skillId }); };
      window.openInstance = function(findingId, instanceIndex, filePath, line, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('openInstance', { findingId: findingId, instanceIndex: Number(instanceIndex) || 0, filePath: filePath, line: Number(line) || 1 });
      };
      window.applySuggestion = function(findingId, suggestionIndex, replacement, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('applySuggestion', { findingId: findingId, suggestionIndex: Number(suggestionIndex) || 0, replacement: replacement });
      };
      window.copySuggestionFix = function(text, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('copySuggestionFix', { text: text });
      };
      window.rejectFinding = function(findingId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('rejectFinding', { findingId: findingId });
      };
      window.suggestBetterDesign = function(findingId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('suggestBetterDesign', { findingId: findingId });
      };
      window.addUserRules = function() { post('addUserRules'); };
      window.toggleUserRule = function(groupId, ruleId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('toggleUserRule', { groupId: groupId, ruleId: ruleId });
      };
      window.deleteUserRule = function(groupId, ruleId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('deleteUserRule', { groupId: groupId, ruleId: ruleId });
      };
      window.deleteUserRuleGroup = function(groupId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('deleteUserRuleGroup', { groupId: groupId });
      };
      window.runAudit = function() {
        post('runAudit');
      };
      window.add = function(payload) {
        post('add', payload || {});
      };
      window.addSkill = function(payload) {
        post('addSkill', payload || {});
      };

      let skillSearchTimer = null;
      window.onSkillSearchInput = function(val) {
        clearTimeout(skillSearchTimer);
        skillSearchTimer = setTimeout(function() {
          post('searchSkills', { query: val });
        }, 300);
      };

      window.onSelectSkillCategory = function(category) {
        post('selectSkillCategory', { category: category });
      };

      window.toggleSkillCheckbox = function(skillId, checkbox, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        const active = (checkbox && typeof checkbox.checked === 'boolean') ? checkbox.checked : Boolean(checkbox);
        post('toggleSkill', { skillId: skillId, active: active });
      };

      window.activateSkillAction = function(skillId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('activateSkill', { skillId: skillId });
      };

      window.installSkillAction = function(skillId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('installSkill', { skillId: skillId, activateImmediately: false });
      };

      window.deleteSkillAction = function(skillId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('deleteSkill', { skillId: skillId });
      };

      window.openSkillSourceAction = function(skillId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('openSkillSource', { skillId: skillId });
      };

      window.toggleSkillDetailsAction = function(skillId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('toggleSkillDetails', { skillId: skillId });
      };

      window.toggleShowMoreRecs = function() {
        post('toggleShowMoreRecommendations');
      };

      window.toggleSkill = function(skillId) {
        post('toggleSkill', { skillId: skillId });
      };

      window.activateRecommendedSkill = function(skillId) {
        post('activateSkill', { skillId: skillId });
      };

      window.filterRuleCat = function(cat) {
        post('filterRuleCategory', { category: cat });
      };

      window.searchRulesInput = function(input) {
        post('searchRules', { query: input ? input.value : '' });
      };

      window.openChecklistFile = function() {
        post('openChecklist');
      };

      window.toggleCriterionAction = function(id, checked, event) {
        if (event) {
          event.stopPropagation();
        }
        post('toggleChecklistCriterion', { id: id, checked: Boolean(checked) });
      };

      window.toggleChecklistIssuesAction = function(criterionId, event) {
        if (event) {
          event.stopPropagation();
        }
        post('toggleChecklistIssues', { criterionId: criterionId });
      };

      // Centralized Event Delegation to protect against broken inline handlers or dynamic DOM rewrites
      document.addEventListener('click', function(e) {
        const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
        if (!el) return;
        const action = el.getAttribute('data-action');
        if (!action) return;

        switch (action) {
          case 'switch-tab': {
            const tab = el.getAttribute('data-tab');
            if (tab) window.switchTab(tab);
            break;
          }
          case 'run-audit': {
            window.runAudit();
            break;
          }
          case 'set-filter': {
            const filter = el.getAttribute('data-filter');
            if (filter) window.setFilter(filter);
            break;
          }
          case 'clear-filter': {
            window.clearFilter();
            break;
          }
          case 'toggle-finding': {
            const fid = el.getAttribute('data-finding-id');
            if (fid) window.toggleFinding(fid);
            break;
          }
          case 'toggle-category': {
            const cat = el.getAttribute('data-category');
            if (cat) window.toggleCategory(cat);
            break;
          }
          case 'open-instance': {
            e.stopPropagation();
            const fid = el.getAttribute('data-finding-id');
            const idx = el.getAttribute('data-instance-index') || 0;
            const fp = el.getAttribute('data-file-path') || '';
            const line = el.getAttribute('data-line') || 1;
            window.openInstance(fid, idx, fp, line, e);
            break;
          }
          case 'apply-suggestion': {
            e.stopPropagation();
            const fid = el.getAttribute('data-finding-id');
            const idx = el.getAttribute('data-suggestion-index') || 0;
            const repl = el.getAttribute('data-replacement') || '';
            window.applySuggestion(fid, idx, repl, e);
            break;
          }
          case 'copy-suggestion-fix': {
            e.stopPropagation();
            const text = el.getAttribute('data-replacement') || '';
            window.copySuggestionFix(text, e);
            break;
          }
          case 'suggest-better-design': {
            e.stopPropagation();
            const fid = el.getAttribute('data-finding-id');
            window.suggestBetterDesign(fid, e);
            break;
          }
          case 'reject-finding': {
            e.stopPropagation();
            const fid = el.getAttribute('data-finding-id');
            window.rejectFinding(fid, e);
            break;
          }
          case 'toggle-user-rule-group': {
            const gid = el.getAttribute('data-group-id');
            if (gid) window.toggleUserRuleGroup(gid);
            break;
          }
          case 'toggle-user-rule-detail': {
            const rid = el.getAttribute('data-rule-id');
            if (rid) window.toggleUserRuleDetail(rid);
            break;
          }
          case 'toggle-user-rule': {
            e.stopPropagation();
            const gid = el.getAttribute('data-group-id');
            const rid = el.getAttribute('data-rule-id');
            if (gid && rid) window.toggleUserRule(gid, rid, e);
            break;
          }
          case 'delete-user-rule': {
            e.stopPropagation();
            const gid = el.getAttribute('data-group-id');
            const rid = el.getAttribute('data-rule-id');
            if (gid && rid) window.deleteUserRule(gid, rid, e);
            break;
          }
          case 'delete-user-rule-group': {
            e.stopPropagation();
            const gid = el.getAttribute('data-group-id');
            if (gid) window.deleteUserRuleGroup(gid, e);
            break;
          }
          case 'add-user-rules': {
            window.addUserRules();
            break;
          }
          case 'add':
          case 'add-skill': {
            window.addSkill();
            break;
          }
          case 'activate-skill': {
            e.stopPropagation();
            const sid = el.getAttribute('data-skill-id');
            if (sid) window.activateSkillAction(sid, e);
            break;
          }
          case 'install-skill': {
            e.stopPropagation();
            const sid = el.getAttribute('data-skill-id');
            if (sid) window.installSkillAction(sid, e);
            break;
          }
          case 'deactivate-skill': {
            e.stopPropagation();
            const sid = el.getAttribute('data-skill-id');
            if (sid) window.toggleSkillCheckbox(sid, { checked: false }, e);
            break;
          }
          case 'delete-skill': {
            e.stopPropagation();
            const sid = el.getAttribute('data-skill-id');
            if (sid) window.deleteSkillAction(sid, e);
            break;
          }
          case 'open-skill-source': {
            e.stopPropagation();
            const sid = el.getAttribute('data-skill-id');
            if (sid) window.openSkillSourceAction(sid, e);
            break;
          }
          case 'toggle-skill-details': {
            e.stopPropagation();
            const sid = el.getAttribute('data-skill-id');
            if (sid) window.toggleSkillDetailsAction(sid, e);
            break;
          }
          case 'toggle-show-more-recs': {
            window.toggleShowMoreRecs();
            break;
          }
          case 'open-checklist': {
            window.openChecklistFile();
            break;
          }
          case 'toggle-checklist-issues': {
            e.stopPropagation();
            const cid = el.getAttribute('data-criterion-id');
            if (cid) window.toggleChecklistIssuesAction(cid, e);
            break;
          }
          case 'select-rule-source': {
            const mode = el.getAttribute('data-mode');
            if (mode) window.selectRuleSource(mode);
            break;
          }
          case 'filter-rule-cat': {
            const cat = el.getAttribute('data-category');
            if (cat) window.filterRuleCat(cat);
            break;
          }
          case 'select-skill-category': {
            const cat = el.getAttribute('data-category');
            if (cat) window.onSelectSkillCategory(cat);
            break;
          }
        }
      });

      // Delegated change handler for checkboxes
      document.addEventListener('change', function(e) {
        const critEl = e.target && e.target.closest ? e.target.closest('input[data-action="toggle-criterion"]') : null;
        if (critEl) {
          e.stopPropagation();
          const criterionId = critEl.getAttribute('data-criterion-id');
          if (criterionId) {
            window.toggleCriterionAction(criterionId, critEl.checked, e);
          }
          return;
        }

        const el = e.target && e.target.closest ? e.target.closest('input[data-action="toggle-skill-checkbox"]') : null;
        if (el) {
          e.stopPropagation();
          const skillId = el.getAttribute('data-skill-id');
          if (skillId) {
            window.toggleSkillCheckbox(skillId, el, e);
          }
        }
      });

      // Internal diagnostic reporting (Section 20)
      window.__craftlensDiagnostic = function() {
        const tabs = document.querySelectorAll('.nav-btn');
        const actions = document.querySelectorAll('[data-action], [onclick]');
        return {
          tabsRegistered: tabs.length + '/5',
          buttonsWithHandlers: actions.length,
          activeTab: document.querySelector('.nav-btn.active')?.textContent?.trim() || 'none',
          status: 'OK'
        };
      };
    })();
  </script>
</body>
</html>`;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Findings View (Section 1, 2, 3, 21)
  // ─────────────────────────────────────────────────────────────
  private renderIssuesView(findings: Finding[], totalIssues: number): string {
    if (totalIssues === 0) {
      return `
        <div style="padding: 32px 16px; text-align: center; color: var(--muted);">
          <div style="font-size: 13px; font-weight: 600; color: var(--header-fg); margin-bottom: 4px;">No Quality Slop Detected</div>
          <div style="font-size: 10.5px; margin-bottom: 12px;">Scanned: UI / UX · Design Tokens · Accessibility · Code Quality · Security</div>
          <button class="btn btn-primary" data-action="run-audit" onclick="runAudit()">Run Review</button>
        </div>
      `;
    }

    const categories: { id: FindingCategory; label: string }[] = [
      { id: 'ui-ux', label: 'UI / UX' },
      { id: 'content', label: 'Content' },
      { id: 'accessibility', label: 'Accessibility' },
      { id: 'code', label: 'Code Quality' },
      { id: 'code-quality', label: 'Code Quality' },
      { id: 'security', label: 'Security' },
      { id: 'performance', label: 'Performance' },
    ];

    const hasActiveFilter = this.issueFilter !== 'all' || Boolean(this.issueSearchQuery);

    return `
      <div class="filter-toolbar">
        <input
          type="text"
          class="search-input"
          placeholder="Filter by title, token, or file..."
          value="${escapeHtml(this.issueSearchQuery)}"
          oninput="onSearch(this)"
        />
        <div class="quick-filters">
          <span class="filter-tag ${this.issueFilter === 'all' ? 'active' : ''}" data-action="set-filter" data-filter="all" onclick="setFilter('all')">All</span>
          <span class="filter-tag ${this.issueFilter === 'error' ? 'active' : ''}" data-action="set-filter" data-filter="error" onclick="setFilter('error')">Error</span>
          <span class="filter-tag ${this.issueFilter === 'warning' ? 'active' : ''}" data-action="set-filter" data-filter="warning" onclick="setFilter('warning')">Warning</span>
          <span class="filter-tag ${this.issueFilter === 'moderate' ? 'active' : ''}" data-action="set-filter" data-filter="moderate" onclick="setFilter('moderate')">Moderate</span>
          <span class="filter-tag ${this.issueFilter === 'hasFix' ? 'active' : ''}" data-action="set-filter" data-filter="hasFix" onclick="setFilter('hasFix')">Fixable</span>
          ${hasActiveFilter ? '<span class="filter-tag" style="color: #ef4444;" data-action="clear-filter" onclick="clearFilter()">Clear</span>' : ''}
        </div>
      </div>

      ${categories.map(cat => {
        const catFindings = findings.filter(f => f.category === cat.id);
        if (catFindings.length === 0) return '';
        const isCatExpanded = this.expandedCategories.has(cat.id);

        return `
          <div class="cat-group">
            <div class="cat-header" data-action="toggle-category" data-category="${cat.id}" onclick="toggleCategory('${cat.id}')">
              <span>${cat.label}</span>
              <span class="cat-badge">${catFindings.length}</span>
            </div>
            ${isCatExpanded ? catFindings.map(f => this.renderFindingCard(f)).join('') : ''}
          </div>
        `;
      }).join('')}
    `;
  }

  /**
   * Finding card formatted strictly according to Section 21 and Section 1, 2, 3.
   */
  private renderFindingCard(f: Finding): string {
    const isExpanded = this.expandedFindingIds.has(f.id || f.ruleId);
    const isSelected = this.selectedFindingId === (f.id || f.ruleId);
    const rawInstances: Array<{ filePath?: string; line?: number; location?: any; snippet?: string }> =
      (f.instances && f.instances.length > 0)
        ? f.instances
        : (f.affectedElements && f.affectedElements.length > 1)
          ? f.affectedElements.map(ae => ({
              filePath: ae.location?.filePath || f.filePath || f.location?.filePath,
              line: ae.line || (ae.location as any)?.start?.line || 1,
              location: ae.location,
              snippet: ae.snippet,
            }))
          : (f.relatedLocations && f.relatedLocations.length > 0)
            ? [f.location, ...f.relatedLocations].map(loc => ({
                filePath: loc?.filePath,
                line: (loc as any)?.start?.line || (loc as any)?.range?.startLine || 1,
                location: loc,
              }))
            : [];

    const instanceCount = rawInstances.length || 1;
    const hasMultipleInstances = instanceCount > 1;

    const semSev = toSemanticSeverity(f.severity);
    const meta = SEMANTIC_SEVERITY_MAP[semSev];
    const label = meta.label;

    const loc = f.location || f.primaryLocation;
    const filePath = f.filePath || loc?.filePath || '';
    const fileName = filePath ? path.basename(filePath) : 'file';
    const startLine = f.startLine || (loc as any)?.start?.line || 1;
    const locText = `${fileName}:${startLine}`;

    const snippet = f.evidence?.[0]?.snippet || '';
    const suggestions: Suggestion[] = f.suggestions && f.suggestions.length > 0 ? f.suggestions : [];

    return `
      <div class="finding-card ${isSelected ? 'selected' : ''}">
        <div class="finding-header-row" onclick="toggleFinding('${f.id || f.ruleId}')" data-action="toggle-finding" data-finding-id="${escapeHtml(f.id || f.ruleId)}">
          <div class="finding-sev-row">
            <span class="sev-badge ${semSev}">${escapeHtml(String(label || 'INFO').toUpperCase())}</span>
          </div>
          <div class="finding-title-row">
            <span class="finding-title-text">${escapeHtml(f.problemTitle || f.title || f.ruleId)}</span>
          </div>
        </div>

        <div class="finding-support-info">
          ${hasMultipleInstances ? `
            <!-- Multiple Instances List (Section 17 & 18) -->
            <div class="finding-instance-count-label">${instanceCount} instances</div>
            <div class="finding-instances-tree">
              ${rawInstances.map((inst, idx) => {
                const instFilePath = inst.filePath || filePath;
                const instFileName = instFilePath ? path.basename(instFilePath) : fileName;
                const instLine = inst.line || (inst.location as any)?.start?.line || (inst.location as any)?.range?.startLine || startLine;
                return `
                  <div class="instance-row">
                    <span class="instance-idx">[${idx + 1}]</span>
                    <span class="finding-location-link"
                          onclick="openInstance('${f.id || f.ruleId}', ${idx}, '${escapeHtml(instFilePath)}', ${instLine}, event)"
                          data-action="open-instance"
                          data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                          data-instance-index="${idx}"
                          data-file-path="${escapeHtml(instFilePath)}"
                          data-line="${instLine}">
                      ${escapeHtml(instFileName)}:${instLine}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <!-- Clickable file and line link (Section 1) -->
            <div class="finding-location-single">
              <span class="finding-location-link"
                    onclick="openInstance('${f.id || f.ruleId}', 0, '${escapeHtml(filePath)}', ${startLine}, event)"
                    data-action="open-instance"
                    data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                    data-instance-index="0"
                    data-file-path="${escapeHtml(filePath)}"
                    data-line="${startLine}">
                ${escapeHtml(locText)}
              </span>
            </div>
          `}

          <!-- Code Snippet -->
          ${snippet ? `
            <div class="code-snippet-box"><code>${escapeHtml(snippet)}</code></div>
          ` : ''}

          <!-- Existing Design Token Detection (Section 20 & 21) -->
          ${f.detectedToken ? `
            <div class="token-callout">
              <span>Existing design token detected:</span>
              <strong style="color: var(--vscode-textLink-foreground, #3794ff); font-family: var(--font-mono);">${escapeHtml(f.detectedToken.name.startsWith('--') ? f.detectedToken.name : '--' + f.detectedToken.name)}</strong>
            </div>
          ` : ''}
        </div>

        <!-- Expandable Explanation & Dynamic Suggestions (Section 2, 3, 21) -->
        ${isExpanded ? `
          <div class="finding-explanation-pane">
            <div class="explanation-item">
              <div class="explanation-heading">Problem</div>
              <div class="explanation-text">${escapeHtml(f.whatIsWrong || f.message)}</div>
            </div>

            <div class="explanation-item">
              <div class="explanation-heading">Why this matters</div>
              <div class="explanation-text">${escapeHtml(f.whyItMatters || f.description || f.whatIsWrong || '')}</div>
            </div>

            <!-- Dynamic Up-to-3 Suggestions (Section 2 & 3) -->
            ${suggestions.length > 0 ? `
              <div class="suggestions-block">
                <div class="suggestions-header">Suggested Fixes (${suggestions.length})</div>
                ${suggestions.map((sug, idx) => `
                  <div class="suggestion-card">
                    <div class="sug-title-row">
                      <span class="sug-icon">${idx + 1}.</span>
                      <span>${escapeHtml(sug.title)}</span>
                    </div>
                    <div class="sug-why">${escapeHtml(sug.explanation)}</div>

                    ${sug.previewDiff ? `
                      <pre class="sug-diff"><code>${escapeHtml(sug.previewDiff)}</code></pre>
                    ` : ''}

                    <div class="sug-actions">
                      <button class="btn ${sug.safe ? 'btn-primary' : ''}"
                              data-action="apply-suggestion"
                              data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                              data-suggestion-index="${idx}"
                              data-replacement="${escapeHtml(sug.replacement || '')}"
                              onclick="applySuggestion('${f.id || f.ruleId}', ${idx}, '', event)">
                        ${escapeHtml(sug.actionLabel || (sug.safe ? 'Apply' : 'Replace'))}
                      </button>
                      ${sug.replacement ? `
                        <button class="btn btn-quiet"
                                data-action="copy-suggestion-fix"
                                data-replacement="${escapeHtml(sug.replacement)}"
                                onclick="copySuggestionFix('', event)">
                          Copy fix
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 6px; flex-wrap: wrap;">
              <button class="btn btn-primary" data-action="suggest-better-design" data-finding-id="${escapeHtml(f.id || f.ruleId)}" onclick="suggestBetterDesign('${f.id || f.ruleId}', event)">
                Suggest Better Design
              </button>
              <button class="btn btn-quiet" data-action="open-instance" data-finding-id="${escapeHtml(f.id || f.ruleId)}" data-instance-index="0" data-file-path="${escapeHtml(filePath)}" data-line="${startLine}" onclick="openInstance('${f.id || f.ruleId}', 0, '${escapeHtml(filePath)}', ${startLine}, event)">
                Open in Editor
              </button>
              <button class="btn btn-quiet" data-action="reject-finding" data-finding-id="${escapeHtml(f.id || f.ruleId)}" onclick="rejectFinding('${f.id || f.ruleId}', event)">
                Dismiss
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Rules View (Section 5, 6, 7, 8, 9)
  // ─────────────────────────────────────────────────────────────
  private renderRulesView(rules: Rule[], stats: { combined: number; builtin: number; user: number; imported: number; skills: number }): string {
    // A. Built-in Rules View (Section 5)
    if (this.ruleSourceMode === 'builtin') {
      const categories = ['all', 'ui-ux', 'content', 'accessibility', 'code', 'security', 'performance'];
      const filtered = rules.filter(r => {
        if (this.ruleCategoryFilter !== 'all') {
          const cat = (r.category || '').toLowerCase();
          if (!cat.includes(this.ruleCategoryFilter)) return false;
        }
        if (this.ruleSearchQuery) {
          const text = `${r.id} ${r.title || r.name || ''} ${r.description}`.toLowerCase();
          return text.includes(this.ruleSearchQuery);
        }
        return true;
      });

      return `
        <div class="filter-toolbar">
          <input
            type="text"
            class="search-input"
            placeholder="Search built-in rules..."
            value="${escapeHtml(this.ruleSearchQuery)}"
            oninput="searchRulesInput(this)"
          />
          <div class="quick-filters">
            ${categories.map(c => `
              <span class="filter-tag ${this.ruleCategoryFilter === c ? 'active' : ''}" data-action="filter-rule-cat" data-category="${c}" onclick="filterRuleCat('${c}')">
                ${c}
              </span>
            `).join('')}
          </div>
        </div>

        <div style="padding: 6px 12px; font-size: 10px; color: var(--muted); border-bottom: 1px solid var(--border);">
          Showing ${filtered.length} built-in rules · <strong>Read-Only</strong>
        </div>

        <div style="padding: 8px 12px;">
          ${filtered.map(r => `
            <div class="user-group-card" style="padding: 8px 10px; margin-bottom: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                <span style="font-weight: 600; color: var(--header-fg); font-size: 11px;">${escapeHtml(r.id)}: ${escapeHtml(r.title || r.name || '')}</span>
                <span class="sev-badge ${toSemanticSeverity(r.severity)}">${escapeHtml(String(toSemanticSeverity(r?.severity) || 'info').toUpperCase())}</span>
              </div>
              <div style="font-size: 10px; color: var(--muted); margin-bottom: 4px;">${escapeHtml(r.description || '')}</div>
              <div style="display: flex; gap: 8px; font-size: 9px; color: var(--muted);">
                <span>Source: CraftLens (Built-in)</span>
                <span>•</span>
                <span>Category: ${escapeHtml(r.category)}</span>
                <span>•</span>
                <span style="color: #10b981;">Enabled</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // B. User Custom Rules Manager View (Section 6, 7, 8)
    if (this.ruleSourceMode === 'user') {
      const userMgr = this.engine?.getUserRuleManager();
      const groups = userMgr ? userMgr.getAllGroups() : [];

      return `
        <div class="user-rules-pane">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--header-fg);">USER RULE LIBRARY</span>
            <button class="btn btn-primary" data-action="add-user-rules" onclick="addUserRules()">
              + Add User Rules
            </button>
          </div>

          <div style="font-size: 10px; color: var(--muted); margin-bottom: 10px;">
            Add custom rules from Markdown files, public URLs, or text. Expand groups to manage individual rules.
          </div>

          ${groups.length === 0 ? `
            <div style="padding: 24px 12px; text-align: center; color: var(--muted); background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius-sm);">
              No custom user rules yet. Click <strong>+ Add User Rules</strong> to import your team guidelines.
            </div>
          ` : ''}

          ${groups.map(g => {
            const isExpanded = this.expandedRuleGroups.has(g.id);
            return `
              <div class="user-group-card">
                <div class="user-group-header" data-action="toggle-user-rule-group" data-group-id="${g.id}" onclick="toggleUserRuleGroup('${g.id}')">
                  <div class="user-group-title">
                    <span>${isExpanded ? '▼' : '▶'}</span>
                    <span>${escapeHtml(g.name)}</span>
                    <span style="color: var(--muted); font-size: 9.5px; font-weight: normal;">(${g.rules.length} rules)</span>
                  </div>
                  <button class="btn btn-quiet" style="padding: 1px 4px; font-size: 9px;" data-action="delete-user-rule-group" data-group-id="${g.id}" onclick="deleteUserRuleGroup('${g.id}', event)">
                    Delete Group
                  </button>
                </div>

                ${isExpanded ? `
                  <div class="user-group-body">
                    ${g.rules.map(r => {
                      const isDetailOpen = this.expandedRuleIds.has(r.id);
                      return `
                        <div class="user-rule-item">
                          <div class="user-rule-header" data-action="toggle-user-rule-detail" data-rule-id="${r.id}" onclick="toggleUserRuleDetail('${r.id}')">
                            <div style="display: flex; align-items: center; gap: 6px;">
                              <span style="font-size: 9px;">${isDetailOpen ? '▾' : '▸'}</span>
                              <span class="user-rule-name">${escapeHtml(r.name)}</span>
                            </div>
                            <span class="sev-badge ${toSemanticSeverity(r.severity)}">${escapeHtml(String(toSemanticSeverity(r?.severity) || 'info').toUpperCase())}</span>
                          </div>

                          ${isDetailOpen ? `
                            <div class="user-rule-details">
                              <div style="color: var(--fg); margin-bottom: 4px;">${escapeHtml(r.description)}</div>
                              <div class="user-rule-meta-row">
                                <span>Source: User</span>
                                <span>Category: ${escapeHtml(r.category)}</span>
                                <span>Method: ${escapeHtml(r.detectionMethod)}</span>
                              </div>
                              <div style="display: flex; gap: 6px; margin-top: 6px;">
                                <button class="btn ${r.enabled ? 'btn-quiet' : 'btn-primary'}" data-action="toggle-user-rule" data-group-id="${g.id}" data-rule-id="${r.id}" onclick="toggleUserRule('${g.id}', '${r.id}', event)">
                                  ${r.enabled ? 'Disable' : 'Enable'}
                                </button>
                                <button class="btn btn-quiet" data-action="delete-user-rule" data-group-id="${g.id}" data-rule-id="${r.id}" onclick="deleteUserRule('${g.id}', '${r.id}', event)">
                                  Delete
                                </button>
                              </div>
                            </div>
                          ` : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // C. Combined View with Real Data Counts (Section 9)
    return `
      <div class="combined-stats-pane">
        <div class="stats-summary-card">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 2px;">
            Active Scan Rules
          </div>
          <div class="stats-big-number">${stats.combined}</div>
          <div style="font-size: 10px; color: var(--muted); margin-bottom: 10px;">
            Real-time combined rule library actively executing during codebase analysis.
          </div>

          <div class="stats-breakdown-row">
            <span>Built-in Rules</span>
            <strong style="color: var(--header-fg); font-family: var(--font-mono);">${stats.builtin}</strong>
          </div>
          <div class="stats-breakdown-row">
            <span>User Rules</span>
            <strong style="color: var(--header-fg); font-family: var(--font-mono);">${stats.user}</strong>
          </div>
          <div class="stats-breakdown-row">
            <span>Imported Rules</span>
            <strong style="color: var(--header-fg); font-family: var(--font-mono);">${stats.imported}</strong>
          </div>
          <div class="stats-breakdown-row">
            <span>Skill Checks</span>
            <strong style="color: var(--header-fg); font-family: var(--font-mono);">${stats.skills}</strong>
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--header-fg); margin-bottom: 6px;">
            Active Rules (${rules.length})
          </div>
          <input
            type="text"
            class="search-input"
            placeholder="Search rules..."
            value="${escapeHtml(this.ruleSearchQuery)}"
            oninput="searchRulesInput(this)"
            style="margin-bottom: 8px;"
          />
          <div>
            ${rules.map(r => `
              <div class="user-group-card" style="padding: 6px 10px; margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: 600; font-size: 10.5px; color: var(--header-fg);">${escapeHtml(r.id)}: ${escapeHtml(r.title || r.name || '')}</span>
                  <span class="sev-badge ${toSemanticSeverity(r.severity)}">${escapeHtml(String(toSemanticSeverity(r?.severity) || 'info').toUpperCase())}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <button class="btn btn-primary" style="width: 100%; justify-content: center; padding: 6px; margin-top: 10px;" data-action="run-audit" onclick="runAudit()">
          Run Scan with Combined Rules
        </button>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Skills View & Recommendations (Section 10, 11, 12)
  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // 3. Skills Manager View (Sections 1-37)
  // ─────────────────────────────────────────────────────────────
  private renderSkillsView(packages: SkillPackage[]): string {
    const mgr = this.engine?.getSkillManager();
    const allSkills: Skill[] = mgr ? mgr.getAllSkillsAsSkills() : [];

    const builtinSkills = allSkills.filter(s => s.source === 'builtin');
    const mySkills = allSkills.filter(s => s.source === 'user-uploaded' || s.source === 'local');
    const installedExternalSkills = allSkills.filter(s => s.source === 'github' || s.source === 'skills-sh');

    const installedCount = allSkills.filter(s => s.installed).length;
    const activeCount = allSkills.filter(s => s.active).length;

    // Check for skill conflicts (Section 26 & 27)
    const activePkgs = packages.filter(p => p.enabled !== false);
    const resolver = (this.engine as any)?.craftLensEngine?.getRuleResolver?.()?.getConflictResolver?.();
    const conflict = resolver ? resolver.detectSkillConflicts(activePkgs, this.projectContext) : { detected: false, message: '' };

    // Dynamic contextual recommendations based on current findings (Section 13 & 14)
    const currentFindings = this.findingStore.getAllFindings();
    const limit = this.showAllRecommendations ? 8 : 3;
    const recommendedSkills = this.discoveryService.getRecommendedSkills({
      findings: currentFindings,
      context: this.projectContext,
      installedSkills: allSkills,
      limit,
    });

    // Discovery / Search results (Section 15, 16, 17, 34, 35)
    const searchPool = this.searchResults.length > 0
      ? this.searchResults
      : this.discoveryService.syncInstalledState(
          this.selectedSkillCategory === 'all'
            ? ECOSYSTEM_SKILLS
            : ECOSYSTEM_SKILLS.filter(s => s.category === this.selectedSkillCategory),
          allSkills
        );

    return `
      <div class="skills-pane">
        <!-- Subtle Top Header with Active Count (Section 25) -->
        <div class="skills-header-bar">
          <div class="skills-header-title">
            Skills <span class="skills-count-subtle">${installedCount} installed · ${activeCount} active</span>
          </div>
          <button class="btn btn-quiet" data-action="add-skill" onclick="addSkill()">+ Add Skill</button>
        </div>

        <!-- Material Conflict Resolution Banner (Section 26 & 27) -->
        ${conflict.detected ? `
          <div class="skill-conflict-banner">
            <div class="skill-conflict-title">Skill Conflict Resolved</div>
            <div class="skill-conflict-desc">${escapeHtml(conflict.message)}</div>
          </div>
        ` : ''}

        <!-- 1. BUILT-IN SKILLS (Section 4) -->
        <div class="skill-group-section">
          <div class="skill-group-header">
            <span>BUILT-IN</span>
            <span style="font-size: 9px; font-weight: normal; color: var(--muted);">${builtinSkills.filter(s => s.active).length}/${builtinSkills.length} active</span>
          </div>
          <div class="skill-rows-list">
            ${builtinSkills.map(s => this.renderSkillRow(s, false)).join('')}
          </div>
        </div>

        <!-- 2. MY SKILLS (User Uploaded Markdown) (Section 1, 2, 4, 10, 11) -->
        <div class="skill-group-section">
          <div class="skill-group-header">
            <span>MY SKILLS</span>
            <span style="font-size: 9px; font-weight: normal; color: var(--muted);">${mySkills.length} installed</span>
          </div>
          ${mySkills.length === 0 ? `
            <div class="skill-empty-hint">No user skills imported yet. Click "+ Add Skill" to add local Markdown rules.</div>
          ` : `
            <div class="skill-rows-list">
              ${mySkills.map(s => this.renderSkillRow(s, true)).join('')}
            </div>
          `}
        </div>

        <!-- 3. INSTALLED SKILLS (GitHub / skills.sh) (Section 4 & 10) -->
        <div class="skill-group-section">
          <div class="skill-group-header">
            <span>INSTALLED</span>
            <span style="font-size: 9px; font-weight: normal; color: var(--muted);">${installedExternalSkills.length} installed</span>
          </div>
          ${installedExternalSkills.length === 0 ? `
            <div class="skill-empty-hint">No external ecosystem skills installed. Discover skills below.</div>
          ` : `
            <div class="skill-rows-list">
              ${installedExternalSkills.map(s => this.renderSkillRow(s, true)).join('')}
            </div>
          `}
        </div>

        <!-- 4. RECOMMENDED FOR THIS PROJECT (Section 13, 14, 29) -->
        <div class="skill-group-section">
          <div class="skill-group-header">
            <span>RECOMMENDED FOR THIS PROJECT</span>
            <span style="font-size: 9px; font-weight: normal; color: var(--muted);">Based on ${currentFindings.length} findings</span>
          </div>
          <div class="rec-skills-list">
            ${recommendedSkills.map(rec => this.renderRecommendedSkillCard(rec)).join('')}
          </div>
          <div class="rec-skills-footer">
            <button class="btn btn-quiet rec-expand-btn" onclick="toggleShowMoreRecs()">
              ${this.showAllRecommendations ? '▲ Show Less' : `▼ ${recommendedSkills.length} shown · Show More`}
            </button>
          </div>
        </div>

        <!-- 5. DISCOVER & SEARCH (Section 15, 16, 17, 34, 35) -->
        <div class="skill-group-section">
          <div class="skill-group-header">
            <span>DISCOVER</span>
            <span style="font-size: 9px; font-weight: normal; color: var(--muted);">GitHub & skills.sh</span>
          </div>

          <div class="skill-search-box">
            <input
              type="text"
              class="skill-search-input"
              placeholder="Search GitHub, skills.sh and popular skills..."
              value="${escapeHtml(this.skillSearchQuery)}"
              oninput="onSkillSearchInput(this.value)"
            />
          </div>

          <div class="skill-category-chips">
            ${['all', 'design', 'code', 'quality', 'workflow'].map(cat => `
              <button
                class="chip-btn ${this.selectedSkillCategory === cat ? 'active' : ''}"
                onclick="onSelectSkillCategory('${cat}')"
              >${String(cat || '').toUpperCase()}</button>
            `).join('')}
          </div>

          ${this.isOfflineMode ? `
            <div class="offline-banner">
              Couldn't reach skill registry. Showing installed and cached skills.
            </div>
          ` : ''}

          <div class="discovery-results-list">
            ${searchPool.slice(0, 10).map(s => this.renderDiscoverySkillRow(s)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderSkillRow(skill: Skill, allowDelete: boolean = false): string {
    const isInstalling = this.installingSkills.has(skill.id);
    const isDetailsOpen = this.selectedSkillDetails === skill.id;
    const versionLabel = skill.version ? `v${skill.version}` : 'Version unknown';

    let sourceLabel = 'BUILT-IN';
    if (skill.source === 'user-uploaded') sourceLabel = 'Local Markdown';
    else if (skill.source === 'local') sourceLabel = 'Local';
    else if (skill.source === 'github') sourceLabel = skill.repository ? `GitHub · ${skill.repository}` : 'GitHub';
    else if (skill.source === 'skills-sh') sourceLabel = skill.repository ? `skills.sh · ${skill.repository}` : 'skills.sh';

    return `
      <div class="skill-row ${skill.active ? 'active-skill' : ''}">
        <div class="skill-row-main">
          <label class="skill-checkbox-wrapper" title="${skill.active ? 'Active: participates in scan' : 'Installed but inactive'}">
            <input
              type="checkbox"
              class="skill-checkbox"
              ${skill.active ? 'checked' : ''}
              data-action="toggle-skill-checkbox"
              data-skill-id="${escapeHtml(skill.id)}"
              onchange="toggleSkillCheckbox('${escapeHtml(skill.id)}', this, event)"
            />
          </label>
          <div class="skill-row-info" data-action="toggle-skill-details" data-skill-id="${escapeHtml(skill.id)}" onclick="toggleSkillDetailsAction('${escapeHtml(skill.id)}', event)">
            <div class="skill-row-name-line">
              <span class="skill-row-name">${escapeHtml(skill.name)}</span>
              <span class="skill-version-tag">${escapeHtml(versionLabel)}</span>
              <span class="skill-source-tag">${escapeHtml(sourceLabel)}</span>
            </div>
            <div class="skill-row-desc" title="${escapeHtml(skill.description)}">${escapeHtml(skill.description)}</div>
          </div>
          <div class="skill-row-actions">
            ${this.renderActionButton(skill, isInstalling)}
            <button class="skill-icon-btn" title="View details" aria-label="View skill details" data-action="toggle-skill-details" data-skill-id="${escapeHtml(skill.id)}" onclick="toggleSkillDetailsAction('${escapeHtml(skill.id)}', event)">
              <span aria-hidden="true">i</span>
            </button>
            ${allowDelete ? `
              <button class="skill-icon-btn delete-btn" title="Remove skill" aria-label="Remove skill" data-action="delete-skill" data-skill-id="${escapeHtml(skill.id)}" onclick="deleteSkillAction('${escapeHtml(skill.id)}', event)">
                <span aria-hidden="true">×</span>
              </button>
            ` : ''}
          </div>
        </div>

        ${isDetailsOpen ? this.renderSkillDetails(skill, allowDelete) : ''}
      </div>
    `;
  }

  private renderRecommendedSkillCard(skill: Skill): string {
    const isInstalling = this.installingSkills.has(skill.id);
    const versionLabel = skill.version ? `v${skill.version}` : 'Version unknown';

    return `
      <div class="rec-skill-row">
        <div class="rec-skill-content">
          <div class="rec-skill-header-line">
            <span class="rec-skill-name">${escapeHtml(skill.name)}</span>
            <span class="skill-version-tag">${escapeHtml(versionLabel)}</span>
            <span class="skill-source-tag">${escapeHtml(skill.source)}</span>
          </div>
          <div class="rec-skill-reason">${escapeHtml((skill as any).reason || skill.description)}</div>
          ${skill.capabilities && skill.capabilities.length > 0 ? `
            <div class="rec-skill-caps">
              ${skill.capabilities.slice(0, 3).map(c => `<span class="rec-cap-tag">${escapeHtml(c)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="rec-skill-action-col">
          ${this.renderActionButton(skill, isInstalling)}
        </div>
      </div>
    `;
  }

  private renderDiscoverySkillRow(skill: Skill): string {
    const isInstalling = this.installingSkills.has(skill.id);
    const installsText = skill.installsCount ? `${(skill.installsCount / 1000).toFixed(1)}k installs` : 'Popular';
    const ratingText = skill.stars ? `Rating ${skill.stars}.0` : '';

    return `
      <div class="discovery-skill-row">
        <div class="discovery-skill-info">
          <div class="discovery-skill-title-line">
            <span class="discovery-skill-title">${escapeHtml(skill.name)}</span>
            <span class="discovery-meta-line">${escapeHtml(skill.author || skill.source)} · ${installsText}${ratingText ? ` · ${ratingText}` : ''}</span>
          </div>
          <div class="discovery-skill-desc">${escapeHtml(skill.description)}</div>
          <div class="discovery-meta-row">
            <span class="compat-status-tag ${skill.compatibility === 'partial' ? 'partial' : 'compatible'}">
              ${skill.compatibility === 'partial' ? 'Partial compatibility' : 'Compatible'}
            </span>
            ${skill.hasExecutableAssets ? `
              <span class="safety-warn-tag" title="Executable scripts quarantined; declarative rules imported safely">Scripts quarantined</span>
            ` : ''}
          </div>
        </div>
        <div class="discovery-skill-action">
          ${this.renderActionButton(skill, isInstalling)}
        </div>
      </div>
    `;
  }

  private renderActionButton(skill: Skill, isInstalling: boolean): string {
    const escapedId = escapeHtml(skill.id);
    if (isInstalling) {
      return `<button class="btn-skill-action state-installing" disabled>Installing…</button>`;
    }

    if (!skill.installed) {
      return `
        <div style="display: inline-flex; align-items: center; gap: 4px;">
          <button class="btn-skill-action state-install" data-action="install-skill" data-skill-id="${escapedId}" onclick="installSkillAction('${escapedId}', event)">Install</button>
          <button class="btn-skill-action state-activate" data-action="activate-skill" data-skill-id="${escapedId}" onclick="activateSkillAction('${escapedId}', event)">Activate</button>
        </div>
      `;
    }

    if (skill.active) {
      return `<button class="btn-skill-action state-active" title="Active in scan" data-action="deactivate-skill" data-skill-id="${escapedId}" onclick="toggleSkillCheckbox('${escapedId}', { checked: false }, event)">Active</button>`;
    }

    return `<button class="btn-skill-action state-activate" title="Activate for scan" data-action="activate-skill" data-skill-id="${escapedId}" onclick="activateSkillAction('${escapedId}', event)">Activate</button>`;
  }

  private renderSkillDetails(skill: Skill, allowDelete: boolean): string {
    return `
      <div class="skill-details-card">
        <div class="skill-details-meta-grid">
          <div><span class="meta-label">Source:</span> <span class="meta-val">${escapeHtml(skill.source)}</span></div>
          <div><span class="meta-label">Version:</span> <span class="meta-val">${escapeHtml(skill.version || 'Version unknown')}</span></div>
          ${skill.repository ? `<div><span class="meta-label">Repo:</span> <span class="meta-val">${escapeHtml(skill.repository)}</span></div>` : ''}
          ${skill.rulesCount !== undefined ? `<div><span class="meta-label">Rules:</span> <span class="meta-val">${skill.rulesCount} checks</span></div>` : ''}
        </div>

        ${skill.capabilities && skill.capabilities.length > 0 ? `
          <div style="margin-top: 6px;">
            <div class="meta-label" style="margin-bottom: 2px;">Capabilities:</div>
            <ul class="skill-caps-list">
              ${skill.capabilities.map(c => `<li>• ${escapeHtml(c)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div class="skill-safety-status">
          <div>SKILL.md validated</div>
          <div>No arbitrary repository script execution</div>
          ${skill.hasExecutableAssets ? `<div style="color: #f59e0b;">Bundled scripts are quarantined and not executed.</div>` : ''}
        </div>

        <div class="skill-details-actions">
          ${skill.active ? `
            <button class="btn-control" data-action="deactivate-skill" data-skill-id="${escapeHtml(skill.id)}" onclick="toggleSkillCheckbox('${escapeHtml(skill.id)}', { checked: false }, event)">Deactivate</button>
          ` : `
            <button class="btn-control btn-primary" data-action="activate-skill" data-skill-id="${escapeHtml(skill.id)}" onclick="toggleSkillCheckbox('${escapeHtml(skill.id)}', { checked: true }, event)">Activate</button>
          `}
          ${(skill.repository || skill.path || skill.readmeUrl) ? `
            <button class="btn-control" data-action="open-skill-source" data-skill-id="${escapeHtml(skill.id)}" onclick="openSkillSourceAction('${escapeHtml(skill.id)}', event)">Open Source</button>
          ` : ''}
          ${allowDelete ? `
            <button class="btn-control delete-btn" style="color: #ef4444;" data-action="delete-skill" data-skill-id="${escapeHtml(skill.id)}" onclick="deleteSkillAction('${escapeHtml(skill.id)}', event)">Remove</button>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Checklist View
  // ─────────────────────────────────────────────────────────────
  private renderChecklistView(items?: ChecklistItem[], findings?: Finding[]): string {
    const canonicalFindings = findings || this.findingStore.getCanonicalFindings();
    const checklistItems = items || this.storageManager.getOrInitAudit(this.projectContext, canonicalFindings)?.items || [];
    const total = checklistItems.length;

    return `
      <div class="checklist-container">
        <div class="checklist-header-bar">
          <div class="checklist-title-group">
            <span class="checklist-heading">Checklist</span>
            <span class="checklist-count-badge">${total}</span>
          </div>
          <button class="btn-control" onclick="openChecklistFile()" data-action="open-checklist" title="Open source checklist.md in editor" aria-label="View checklist.md">
            View checklist.md
          </button>
        </div>
        <div class="checklist-list" role="list">
          ${checklistItems.map(item => {
            const ruleIds = item.relatedRuleIds || item.relatedRules || [];
            const criterionFindings = canonicalFindings.filter(f => ruleIds.includes(f.ruleId));
            const issueCount = criterionFindings.length > 0 ? criterionFindings.length : (item.findingCount || 0);

            // 4-state checklist model:
            // 1. Not detected: unchecked, white, no user icon, 0 issues
            // 2. Issues: unchecked, red, no user icon, >0 issues
            // 3. Acknowledged: checked, yellow, yes user icon, >0 issues
            // 4. Fixed: checked, green, no user icon, 0 issues
            let stateClass = 'not-detected';
            let isAcknowledged = false;
            let isChecked = Boolean(item.checked);

            if (issueCount > 0) {
              if (item.checked && item.manualOverride) {
                stateClass = 'acknowledged';
                isAcknowledged = true;
                isChecked = true;
              } else {
                stateClass = 'issues';
                isAcknowledged = false;
                isChecked = false;
              }
            } else {
              if (item.checked) {
                stateClass = 'fixed';
                isChecked = true;
              } else {
                stateClass = 'not-detected';
                isChecked = false;
              }
            }

            const isExpanded = this.expandedChecklistCriterionId === item.id;

            return `
              <div class="checklist-item-wrapper ${isExpanded ? 'is-expanded' : ''}" data-criterion-id="${escapeHtml(item.id)}">
                <div class="checklist-item-row state-${stateClass} ${isChecked ? 'is-checked' : ''}" role="listitem">
                  <div class="checklist-item-left">
                    <input
                      type="checkbox"
                      id="chk-${escapeHtml(item.id)}"
                      class="checklist-checkbox"
                      data-criterion-id="${escapeHtml(item.id)}"
                      data-action="toggle-criterion"
                      ${isChecked ? 'checked' : ''}
                      onchange="toggleCriterionAction('${escapeHtml(item.id)}', this.checked, event)"
                      aria-label="${escapeHtml(item.title)}"
                    />
                    <label class="checklist-item-label" for="chk-${escapeHtml(item.id)}">
                      <span class="checklist-item-title">${escapeHtml(item.title)}</span>
                    </label>
                  </div>
                  <div class="checklist-item-right">
                    ${isAcknowledged ? `
                      <span class="checklist-user-icon" title="Acknowledged by user" aria-label="Acknowledged by user">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0-2.21-2.69-4-6-4s-6 1.79-6 4v1h12v-1zm-1.07 0c-.45-1.39-2.42-2.5-4.93-2.5-2.51 0-4.48 1.11-4.93 2.5h9.86z"/>
                        </svg>
                      </span>
                    ` : ''}
                    <span class="checklist-issue-count">${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}</span>
                    <button
                      class="checklist-view-issues-btn"
                      data-action="toggle-checklist-issues"
                      data-criterion-id="${escapeHtml(item.id)}"
                      onclick="toggleChecklistIssuesAction('${escapeHtml(item.id)}', event)"
                      title="${isExpanded ? 'Hide issues' : 'View issues'}"
                      aria-label="${isExpanded ? 'Hide issues' : 'View issues'} for ${escapeHtml(item.title)}"
                    >
                      ${isExpanded ? 'Hide issues' : 'View issues'}
                    </button>
                  </div>
                </div>
                ${isExpanded ? `
                  <div class="checklist-issues-panel" data-criterion-id="${escapeHtml(item.id)}">
                    <div class="checklist-issues-panel-header">
                      <span class="checklist-issues-panel-title">${criterionFindings.length} ${criterionFindings.length === 1 ? 'issue' : 'issues'}</span>
                    </div>
                    ${criterionFindings.length === 0 ? `
                      <div class="checklist-issues-empty">
                        No issues detected for this criterion.
                      </div>
                    ` : `
                      <div class="checklist-issues-list">
                        ${criterionFindings.map(f => this.renderFindingCard(f)).join('')}
                      </div>
                    `}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Metrics View
  // ─────────────────────────────────────────────────────────────
  private renderMetricsView(): string {
    return `
      <div style="padding: 12px;">
        <div style="font-size: 12px; font-weight: 700; color: var(--header-fg); margin-bottom: 8px;">
          Codebase Quality Health
        </div>
        <div style="font-size: 10.5px; color: var(--muted); margin-bottom: 4px;">
          Audit Rigor Level
        </div>
        <div style="display: flex; gap: 4px; margin-bottom: 12px;">
          <span class="filter-tag">EASY</span>
          <span class="filter-tag">MODERATE</span>
          <span class="filter-tag">HARD</span>
          <span class="filter-tag">STRICT</span>
        </div>
        <div style="font-size: 10px; color: var(--muted);">
          Auto-Audit on Save & Change
        </div>
      </div>
    `;
  }
}
