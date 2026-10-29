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
  ContextAwareFixGenerator,
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
  private expandedCategories: Set<string> = new Set(['ui-ux', 'security', 'performance', 'accessibility', 'backend', 'content', 'code', 'code-quality', 'dependencies']);
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

    const unsubSelection = this.findingStore.onDidSelectIssue((issueId) => {
      if (this.selectedFindingId !== issueId) {
        this.selectedFindingId = issueId;
        if (issueId) {
          this.expandedFindingIds.add(issueId);
          const f = this.findingStore.getFindingById(issueId);
          if (f?.category) {
            this.expandedCategories.add(f.category);
          }
        }
        this._view?.webview.postMessage({ type: 'highlightFinding', findingId: issueId });
        this.updateHtml();
      }
    });
    this.disposables.push({ dispose: unsubSelection });

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
          case 'openProjectOverview':
            await vscode.commands.executeCommand('craftlens.openProjectOverview');
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
            this.findingStore.setSelectedIssueId(message.findingId);
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
            this.findingStore.setSelectedIssueId(message.findingId);
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

        case 'applySuggestedFix':
          if (message.findingId) {
            const rawFinding = this.findingStore.getFindingById(message.findingId) ||
              this.findingStore.getAllFindings().find(f => f.id === message.findingId || f.ruleId === message.findingId || f.fingerprint === message.findingId);
            if (rawFinding) {
              if (rawFinding.suggestions && rawFinding.suggestions.length > 0) {
                await vscode.commands.executeCommand('craftlens.applySuggestion', rawFinding.id || message.findingId, 0);
              } else if (rawFinding.designFix || rawFinding.fix) {
                const docUri = vscode.Uri.file(rawFinding.location?.filePath || rawFinding.filePath || '');
                await vscode.commands.executeCommand('craftlens.applyQuickFix', docUri, rawFinding);
              } else if (rawFinding.recommendations && rawFinding.recommendations.length > 0) {
                await vscode.commands.executeCommand('craftlens.applyRecommendation', rawFinding, rawFinding.recommendations[0]);
              } else {
                await vscode.commands.executeCommand('craftlens.applySuggestion', rawFinding.id || message.findingId, 0);
              }
            } else {
              await vscode.commands.executeCommand('craftlens.applySuggestion', message.findingId, 0);
            }
          }
          break;

        case 'showManualFix':
          if (message.findingId) {
            const rawFinding = this.findingStore.getFindingById(message.findingId) ||
              this.findingStore.getAllFindings().find(f => f.id === message.findingId || f.ruleId === message.findingId || f.fingerprint === message.findingId);
            if (rawFinding) {
              const guide = rawFinding.suggestions?.[0]?.explanation ||
                            rawFinding.recommendations?.[0]?.description ||
                            rawFinding.howToFix ||
                            rawFinding.description ||
                            'Manual remediation: Follow project design tokens and conventions.';
              vscode.window.showInformationMessage(`CraftLens Manual Fix: ${guide}`);
              await vscode.commands.executeCommand('craftlens.showFindingDetail', rawFinding);
            }
          }
          break;

        case 'showFindingDetail':
          if (message.findingId) {
            this.findingStore.setSelectedIssueId(message.findingId);
            const rawFinding = this.findingStore.getFindingById(message.findingId) ||
              this.findingStore.getAllFindings().find(f => f.id === message.findingId || f.ruleId === message.findingId || f.fingerprint === message.findingId);
            if (rawFinding) {
              await vscode.commands.executeCommand('craftlens.showFindingDetail', rawFinding);
            }
          }
          break;

        case 'rejectFinding':
          if (message.findingId) {
            const rawFinding = this.findingStore.getFindingById(message.findingId) ||
              this.findingStore.getAllFindings().find(f => f.id === message.findingId || f.ruleId === message.findingId || f.fingerprint === message.findingId);
            await vscode.commands.executeCommand('craftlens.rejectFinding', rawFinding || message.findingId);
          }
          break;

        case 'runAudit':
          await vscode.commands.executeCommand('craftlens.runAudit');
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

        case 'openMasterChecklist':
        case 'openChecklist':
          await vscode.commands.executeCommand('craftlens.openMasterChecklist');
          break;

        case 'openIssuesFile':
        case 'openIssuesDoc':
        case 'openProblemsFile':
        case 'openProblemsDoc':
          await vscode.commands.executeCommand('craftlens.openIssuesFile');
          break;

        case 'openSuggestionsFile':
        case 'openSuggestionsDoc':
        case 'openSuggestionFile':
        case 'openSuggestionDoc':
          await vscode.commands.executeCommand('craftlens.openSuggestionsFile');
          break;

        case 'openChangesFile':
        case 'openChangesDoc':
          await vscode.commands.executeCommand('craftlens.openChangesFile');
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
  this.findingStore.setSelectedIssueId(id);
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
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-sideBar-foreground, var(--vscode-foreground));
      --header-fg: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-sideBar-border, var(--vscode-panel-border));
      --border-subtle: var(--vscode-sideBar-border, var(--vscode-panel-border));
      --surface: var(--vscode-editor-background);
      --surface-raised: var(--vscode-input-background);
      --surface-hover: var(--vscode-list-hoverBackground);
      --font-mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      --radius-sm: 2px;
      --radius-md: 3px;
      --control-height: 24px;

      /* Semantic Severities (UX Approved & WCAG AA Accessible Theme Adapting) */
      --sev-error: var(--vscode-errorForeground, var(--vscode-editorError-foreground));
      --sev-warning: var(--vscode-editorWarning-foreground, var(--vscode-charts-orange));
      --sev-moderate: var(--vscode-charts-orange, var(--vscode-editorWarning-foreground));
      --sev-info: var(--vscode-editorInfo-foreground);
      --status-success: var(--vscode-testing-iconPassed, var(--vscode-charts-green, currentColor));
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

    /* Live Dashboard (3 Compact Cards) */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 5px;
      margin: 8px 0 8px;
      min-width: 0;
    }
    @media (max-width: 260px) {
      .dashboard-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .dashboard-card[data-card="checklist"] {
        grid-column: 1 / -1;
      }
    }
    @media (max-width: 170px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
      .dashboard-card[data-card="checklist"] {
        grid-column: auto;
      }
    }
    .dashboard-card {
      background: var(--surface-raised);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm, 2px);
      padding: 6px 4px 5px;
      text-align: center;
      cursor: pointer;
      user-select: none;
      transition: background 0.12s ease, border-color 0.12s ease;
      min-width: 0;
      box-sizing: border-box;
    }
    .dashboard-card:hover {
      background: var(--surface-hover);
      border-color: var(--vscode-focusBorder, var(--border));
    }
    .dashboard-card:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .dashboard-card-val {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.1;
      font-family: var(--font-mono);
      color: var(--header-fg);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dashboard-card-label {
      font-size: 9.5px;
      font-weight: 500;
      color: var(--muted);
      margin-top: 3px;
      line-height: 1.2;
      white-space: nowrap;
    }  overflow: hidden;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .top-toolbar {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .top-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border-radius: var(--radius-sm, 2px);
      background: transparent;
      color: var(--fg);
      border: 1px solid transparent;
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .top-icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.12));
      color: var(--vscode-button-foreground, currentColor);
    }
    .top-icon-btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, var(--focus));
      outline-offset: 1px;
    }
    .project-overview-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      height: 22px;
      padding: 0 7px;
      font-size: 10px;
      font-weight: 600;
      border-radius: var(--radius-sm, 2px);
      background: var(--vscode-button-background, transparent);
      color: var(--vscode-button-foreground, currentColor);
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .project-overview-btn:hover {
      background: var(--vscode-button-hoverBackground, transparent);
      color: var(--vscode-button-foreground, currentColor);
    }
    .project-overview-btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, var(--focus));
      outline-offset: 1px;
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
      background: var(--vscode-button-background, var(--primary));
      color: var(--vscode-button-foreground, currentColor);
      border-color: transparent;
      font-weight: 600;
    }

    /* Living Documents Links Bar */
    .docs-links-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--border-subtle);
      font-size: 10px;
      flex-wrap: wrap;
    }
    .docs-bar-label {
      color: var(--muted);
      font-weight: 600;
      margin-right: 2px;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
    }
    .doc-link-chip {
      padding: 2px 6px;
      font-size: 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      border: 1px solid var(--vscode-button-border, var(--border));
      color: var(--vscode-button-secondaryForeground, var(--fg));
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      line-height: 1.3;
      font-weight: 500;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .doc-link-chip:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--surface-hover));
      border-color: var(--vscode-focusBorder, var(--focus));
      color: var(--header-fg);
    }
    .doc-links-group {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      align-items: center;
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
    .nav-btn:focus-visible { outline: 1px solid var(--vscode-focusBorder, var(--focus)); outline-offset: -2px; }
    .nav-btn.active {
      color: var(--header-fg);
      border-bottom-color: var(--vscode-panelTitle-activeBorder, var(--vscode-activityBar-foreground, var(--focus)));
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
      background: var(--vscode-input-background, var(--surface));
      border: 1px solid var(--vscode-input-border, var(--border));
      border-radius: var(--radius-sm);
      color: var(--vscode-input-foreground, var(--fg));
      font-size: 11px;
      margin-bottom: 6px;
      outline: none;
    }
    .search-input:focus { border-color: var(--vscode-focusBorder, var(--focus)); }
    .search-input::placeholder { color: var(--vscode-input-placeholderForeground, var(--muted)); }
    .search-input:focus, .search-input:focus-visible { border-color: var(--vscode-focusBorder, var(--focus)); outline: 1px solid var(--vscode-focusBorder, var(--focus)); }
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
    .filter-tag:focus-visible { outline: 1px solid var(--vscode-focusBorder, var(--focus)); outline-offset: 1px; }
    .filter-tag.active {
      background: var(--vscode-list-activeSelectionBackground, var(--surface-hover));
      color: var(--vscode-list-activeSelectionForeground, currentColor);
      border-color: var(--vscode-focusBorder, var(--focus));
      font-weight: 600;
    }

    /* Finding Row & Section Structure */
    .cat-group {
      margin-bottom: 2px;
    }
    .cat-group.collapsed .cat-body {
      display: none !important;
    }
    .cat-group.collapsed .security-empty-state {
      display: none !important;
    }
    .cat-header {
      padding: 6px 12px;
      background: var(--surface);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--muted);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
      min-height: 28px;
      box-sizing: border-box;
      transition: background 0.1s ease, color 0.1s ease;
    }
    .cat-header:hover {
      background: var(--surface-hover);
      color: var(--header-fg);
    }
    .cat-header:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, var(--focus));
      outline-offset: -1px;
    }
    .cat-header-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      line-height: 1;
      height: 100%;
    }
    .finding-card {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg);
      transition: background 0.1s ease;
    }
    .finding-card:hover { background: var(--surface-hover); }
    .finding-card.selected {
      background: var(--surface-raised);
      border-left: 2px solid var(--vscode-focusBorder, var(--focus));
    }
    .finding-card.fixing, .finding-card.card-processing {
      opacity: 0.85;
    }
    .finding-card.fixing .fix-action-btn, .finding-card.card-processing .fix-action-btn {
      cursor: wait;
    }

    .finding-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 3px;
    }
    .finding-title-row {
      display: flex;
      align-items: baseline;
      width: 100%;
      cursor: pointer;
      margin-bottom: 3px;
    }
    .finding-title-text {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--header-fg);
      line-height: 1.35;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .finding--error .finding-title-text,
    .finding--critical .finding-title-text,
    .finding--security .finding-title-text,
    .finding-title-text.sev-title--error,
    .finding-title-text.sev-title--critical,
    .finding-title-text.sev-title--security {
      color: var(--sev-error, var(--status-error));
    }
    .finding--warning .finding-title-text,
    .finding-title-text.sev-title--warning {
      color: var(--sev-warning, var(--status-warning));
    }
    .finding--moderate .finding-title-text,
    .finding-title-text.sev-title--moderate,
    .finding-title-text.sev-title--medium {
      color: var(--sev-moderate, var(--status-warning));
    }
    .finding--suggestion .finding-title-text,
    .finding--info .finding-title-text,
    .finding--low .finding-title-text,
    .finding-title-text.sev-title--suggestion,
    .finding-title-text.sev-title--info,
    .finding-title-text.sev-title--low {
      color: var(--sev-info, var(--color-accent));
    }
    .finding-short-desc {
      font-size: 10.5px;
      color: var(--muted);
      line-height: 1.35;
      margin-bottom: 6px;
    }
    .finding-fix-preview {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 5px;
      font-size: 10.5px;
      line-height: 1.35;
      word-break: break-word;
    }
    .fix-preview-label {
      font-size: 9.5px;
      font-weight: 700;
      color: var(--header-fg);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .fix-preview-text {
      color: var(--fg);
      opacity: 0.95;
    }
    .finding-actions-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }
    .fix-action-btn {
      font-weight: 600;
      font-size: 10.5px;
      padding: 3px 9px;
      border-radius: var(--radius-sm, 2px);
    }
    .fix-action-btn.disabled, .fix-action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .reject-action-btn {
      font-size: 10.5px;
      padding: 3px 8px;
    }
    .finding-instance-count-label {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 3px;
      font-family: var(--font-mono, monospace);
    }
    .finding-location-single {
      display: inline-flex;
      align-items: center;
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
      padding: 1px 6px;
      border-radius: var(--radius-sm, 2px);
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
    }
    .sev-badge.error, .sev-badge.critical, .sev-badge.security {
      background: rgba(239, 68, 68, 0.16);
      color: var(--sev-error, var(--status-error));
      border: 1px solid rgba(248, 113, 113, 0.4);
    }
    .sev-badge.warning {
      background: rgba(249, 115, 22, 0.16);
      color: var(--sev-warning, var(--status-warning));
      border: 1px solid rgba(251, 146, 60, 0.4);
    }
    .sev-badge.moderate, .sev-badge.medium {
      background: rgba(249, 115, 22, 0.16);
      color: var(--sev-moderate, var(--status-warning));
      border: 1px solid rgba(249, 115, 22, 0.4);
    }
    .sev-badge.suggestion, .sev-badge.low, .sev-badge.info {
      background: rgba(234, 179, 8, 0.16);
      color: var(--sev-info, var(--color-accent));
      border: 1px solid rgba(234, 179, 8, 0.4);
    }

    .finding-location-link {
      font-family: var(--font-mono);
      font-size: 10.5px;
      color: var(--vscode-textLink-foreground, var(--sev-info));
      cursor: pointer;
      display: inline-block;
      text-decoration: none;
    }
    .finding-location-link:hover {
      text-decoration: underline;
      color: var(--vscode-textLink-activeForeground, var(--sev-info));
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
      box-sizing: border-box;
      max-width: 100%;
    }
    .finding--error .code-snippet-box,
    .finding--critical .code-snippet-box,
    .finding--security .code-snippet-box,
    .code-snippet-box.snippet--error,
    .code-snippet-box.snippet--critical,
    .code-snippet-box.snippet--security {
      border: 1px solid rgba(239, 68, 68, 0.35);
      border-left: 3px solid var(--sev-error, var(--status-error));
      background: rgba(239, 68, 68, 0.06);
    }
    .finding--warning .code-snippet-box,
    .code-snippet-box.snippet--warning {
      border: 1px solid rgba(249, 115, 22, 0.35);
      border-left: 3px solid var(--sev-warning, var(--status-warning));
      background: rgba(249, 115, 22, 0.06);
    }
    .finding--moderate .code-snippet-box,
    .code-snippet-box.snippet--moderate {
      border: 1px solid rgba(234, 88, 12, 0.35);
      border-left: 3px solid var(--sev-moderate, var(--status-warning));
      background: rgba(234, 88, 12, 0.06);
    }
    .finding--suggestion .code-snippet-box,
    .finding--info .code-snippet-box,
    .finding--low .code-snippet-box,
    .code-snippet-box.snippet--suggestion,
    .code-snippet-box.snippet--info,
    .code-snippet-box.snippet--low {
      border: 1px dashed rgba(56, 189, 248, 0.35);
      border-left: 3px solid var(--sev-info, var(--color-accent));
      background: rgba(56, 189, 248, 0.06);
    }

    .cat-chevron {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      font-size: 11px;
      line-height: 1;
      text-align: center;
      color: var(--muted);
      user-select: none;
      flex-shrink: 0;
      vertical-align: middle;
      transform: translateY(-1px);
      transition: color 0.12s ease;
    }
    .cat-header:hover .cat-chevron {
      color: var(--header-fg);
    }
    .cat-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      line-height: 1;
      vertical-align: middle;
    }
    .cat-icon svg {
      width: 13px;
      height: 13px;
      display: block;
    }
    .cat-title-text {
      display: inline-flex;
      align-items: center;
      line-height: 1;
      letter-spacing: 0.3px;
      vertical-align: middle;
    }
    .cat-badge {
      font-family: var(--font-mono);
      font-size: 9.5px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--surface-raised, rgba(255, 255, 255, 0.08));
      color: var(--muted, currentColor);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      line-height: 1.2;
      box-sizing: border-box;
    }
    .cat-sev-pill {
      font-family: var(--font-mono);
      font-size: 8.5px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .cat-sev-pill.cat-sev--critical {
      background: rgba(239, 68, 68, 0.15);
      color: var(--status-error);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .cat-sev-pill.cat-sev--warning {
      background: rgba(245, 158, 11, 0.15);
      color: var(--status-warning);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .cat-sev-pill.cat-sev--info {
      background: rgba(56, 189, 248, 0.15);
      color: var(--color-accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .clickable-title {
      cursor: pointer;
      transition: opacity 0.1s ease;
    }
    .clickable-title:hover {
      text-decoration: underline;
      opacity: 0.9;
    }
    .finding-locations-stacked {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 2px 0 6px 0;
      padding-left: 2px;
    }
    .stacked-location-item {
      font-size: 10.5px;
      color: var(--muted);
      line-height: 1.35;
    }
    .stacked-location-item .finding-location-link {
      color: var(--link);
      cursor: pointer;
      text-decoration: none;
    }
    .stacked-location-item .finding-location-link:hover {
      text-decoration: underline;
    }
    .clickable-fix-preview {
      cursor: pointer;
      padding: 3px 4px;
      margin: -3px -4px 3px -4px;
      border-radius: 3px;
      transition: background 0.12s ease;
    }
    .clickable-fix-preview:hover {
      background: var(--surface-hover, rgba(255, 255, 255, 0.04));
    }
    .fix-preview-clickable {
      color: var(--fg);
      cursor: pointer;
      text-decoration: underline;
      text-decoration-style: dotted;
      text-underline-offset: 3px;
    }
    .fix-preview-clickable:hover {
      color: var(--link);
      text-decoration: underline;
    }

    .security-audit-section {
      margin-top: 4px;
    }
    .security-cat-header {
      border-left: 2px solid var(--sev-error, var(--status-error));
    }
    .security-why-matters {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 4px;
      line-height: 1.35;
      word-break: break-word;
    }
    .security-why-matters strong {
      color: var(--header-fg);
    }

    .token-callout {
      padding: 3px 6px;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-left: 2px solid var(--vscode-textLink-foreground, var(--sev-info));
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
      color: var(--vscode-textLink-foreground, var(--sev-info));
    }
    .sug-why {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 5px;
      line-height: 1.35;
    }
    .sug-diff {
      background: var(--surface-raised);
      border-left: 2px solid var(--vscode-focusBorder, var(--focus));
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
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      color: var(--vscode-button-secondaryForeground, currentColor);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      line-height: 1.35;
      user-select: none;
    }
    .btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--surface-hover));
      color: var(--vscode-button-secondaryForeground, currentColor);
    }
    .btn:focus-visible { outline: 1px solid var(--vscode-focusBorder, var(--focus)); outline-offset: 1px; }
    .btn-primary {
      background: var(--vscode-button-background, var(--primary));
      color: var(--vscode-button-foreground, currentColor);
      border-color: var(--vscode-button-border, transparent);
      font-weight: 600;
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground, var(--surface-hover)); }
    .btn-quiet {
      background: transparent;
      border-color: transparent;
      color: var(--vscode-foreground);
    }
    .btn-quiet:hover {
      color: var(--vscode-foreground, currentColor);
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
      color: var(--sev-warning);
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
      accent-color: var(--vscode-button-background, var(--primary));
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
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      color: var(--vscode-button-secondaryForeground, currentColor);
      cursor: pointer;
      user-select: none;
      flex-shrink: 0;
      box-sizing: border-box;
      vertical-align: middle;
    }
    .skill-icon-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--surface-hover));
      color: var(--vscode-button-secondaryForeground, currentColor);
    }
    .skill-icon-btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, var(--focus));
      outline-offset: 1px;
    }
    .skill-icon-btn.delete-btn:hover {
      color: var(--vscode-errorForeground, var(--status-error));
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
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      color: var(--vscode-button-secondaryForeground, currentColor);
      border: 1px solid var(--vscode-button-border, var(--border));
    }
    .btn-skill-action.state-install:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--surface-hover));
      color: var(--vscode-button-secondaryForeground, currentColor);
    }
    .btn-skill-action.state-installing {
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      color: var(--muted);
      cursor: wait;
    }
    .btn-skill-action.state-activate {
      background: var(--vscode-button-background, var(--primary));
      color: var(--vscode-button-foreground, currentColor);
      font-weight: 600;
    }
    .btn-skill-action.state-activate:hover {
      background: var(--vscode-button-hoverBackground, var(--surface-hover));
    }
    .btn-skill-action.state-active {
      background: transparent;
      color: var(--vscode-testing-iconPassed, var(--status-success));
      border-color: transparent;
    }
    .btn-skill-action.state-update {
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      color: var(--vscode-editorWarning-foreground, var(--sev-warning));
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
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      color: var(--vscode-button-secondaryForeground, currentColor);
      cursor: pointer;
      user-select: none;
      flex-shrink: 0;
      box-sizing: border-box;
      vertical-align: middle;
    }
    .btn-control:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--surface-hover));
      color: var(--vscode-button-secondaryForeground, currentColor);
    }
    .btn-control:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, var(--focus));
      outline-offset: 1px;
    }
    .btn-control.btn-primary {
      background: var(--vscode-button-background, var(--primary));
      color: var(--vscode-button-foreground, currentColor);
      border-color: transparent;
      font-weight: 600;
    }
    .btn-control.btn-primary:hover {
      background: var(--vscode-button-hoverBackground, var(--surface-hover));
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
      accent-color: var(--vscode-button-background, var(--primary));
      width: 14px;
      height: 14px;
      margin: 0;
      flex-shrink: 0;
    }
    .checklist-checkbox:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, var(--focus));
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
      color: var(--vscode-editorWarning-foreground, var(--sev-warning));
      flex-shrink: 0;
    }
    .checklist-view-issues-btn {
      background: var(--vscode-button-secondaryBackground, var(--surface-raised));
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-button-secondaryForeground);
      font-size: 10.5px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      line-height: 1.35;
      white-space: nowrap;
    }
    .checklist-view-issues-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--surface-hover));
      color: var(--vscode-button-secondaryForeground, currentColor);
    }

    /* 4-State checklist styling */
    .checklist-item-row.state-not-detected .checklist-item-title {
      color: var(--fg);
    }
    .checklist-item-row.state-not-detected .checklist-issue-count {
      color: var(--muted);
    }

    .checklist-item-row.state-issues .checklist-item-title {
      color: var(--vscode-errorForeground, var(--status-error));
    }
    .checklist-item-row.state-issues .checklist-issue-count {
      color: var(--vscode-errorForeground, var(--status-error));
      font-weight: 600;
    }
    .checklist-item-row.state-issues .checklist-checkbox {
      accent-color: var(--vscode-errorForeground, var(--status-error));
    }

    .checklist-item-row.state-acknowledged .checklist-item-title {
      color: var(--vscode-editorWarning-foreground, var(--status-warning));
    }
    .checklist-item-row.state-acknowledged .checklist-issue-count {
      color: var(--vscode-editorWarning-foreground, var(--status-warning));
      font-weight: 600;
    }
    .checklist-item-row.state-acknowledged .checklist-checkbox {
      accent-color: var(--vscode-editorWarning-foreground, var(--sev-warning));
    }

    .checklist-item-row.state-fixed .checklist-item-title {
      color: var(--vscode-testing-iconPassed, var(--status-success));
    }
    .checklist-item-row.state-fixed .checklist-issue-count {
      color: var(--vscode-testing-iconPassed, var(--status-success));
    }
    .checklist-item-row.state-fixed .checklist-checkbox {
      accent-color: var(--vscode-testing-iconPassed, var(--status-success));
    }

    /* Inline Issues Panel */
    .checklist-issues-panel {
      margin: 2px 0 6px 8px;
      padding: 6px 8px;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-left: 2px solid var(--vscode-focusBorder, var(--focus));
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
      color: var(--sev-info);
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
      color: var(--status-success);
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
      color: var(--sev-info);
      border-color: rgba(59, 130, 246, 0.4);
      font-weight: 600;
    }
    .offline-banner {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.25);
      color: var(--sev-warning);
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
      color: var(--sev-warning);
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
      color: var(--status-success);
      background: rgba(16, 185, 129, 0.1);
    }
    .compat-status-tag.partial {
      color: var(--sev-warning);
      background: rgba(245, 158, 11, 0.1);
    }
    .safety-warn-tag {
      font-size: 8.5px;
      color: var(--sev-warning);
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
      <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; overflow: hidden; margin-right: 6px;">
        <span class="brand-title">CraftLens</span>
      </div>
      <div class="top-toolbar" role="toolbar" aria-label="CraftLens quick actions">
        <button class="project-overview-btn" onclick="openProjectOverview()" title="Open Project Overview in Editor Tab" aria-label="Open Project Overview in Editor Tab">
          ⊞ Overview
        </button>
      </div>
    </div>

    <!-- Live Dashboard (3 Compact Cards) -->
    <div class="dashboard-grid" role="region" aria-label="Project Status Dashboard">
      <div class="dashboard-card" onclick="openProjectOverview()" data-card="code-quality" title="Code Quality Score (Click to open Project Overview)">
        <div class="dashboard-card-val" id="dashboard-code-quality-val">${auditState.score ?? 100}</div>
        <div class="dashboard-card-label">Code Quality</div>
      </div>
      <div class="dashboard-card" onclick="switchTab('audit')" data-card="open-issues" title="Open Issues (Click to view issues)">
        <div class="dashboard-card-val" id="dashboard-open-issues-val">${totalIssues}</div>
        <div class="dashboard-card-label">Open Issues</div>
      </div>
      <div class="dashboard-card" onclick="switchTab('checklist')" data-card="checklist" title="Checklist Criteria (Click to view checklist)">
        <div class="dashboard-card-val" id="dashboard-checklist-val">${checklistCriteriaCount}</div>
        <div class="dashboard-card-label">Checklist</div>
      </div>
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

    <!-- Persistent Living Documents Quick Links -->
    <div class="docs-links-bar" role="navigation" aria-label="CraftLens documents">
      <span class="docs-bar-label">Docs:</span>
      <div class="doc-links-group">
        <button class="doc-link-chip" onclick="openIssuesFile()" data-action="open-issues-file" title="Open issues.md in editor" aria-label="Open issues.md">
          issues.md
        </button>
        <button class="doc-link-chip" onclick="openSuggestionsFile()" data-action="open-suggestions-file" title="Open suggestions.md in editor" aria-label="Open suggestions.md">
          suggestions.md
        </button>
        <button class="doc-link-chip" onclick="openChangesFile()" data-action="open-changes-file" title="Open changes.md in editor" aria-label="Open changes.md">
          changes.md
        </button>
        <button class="doc-link-chip" onclick="openChecklistFile()" data-action="open-checklist" title="Open checklist.md in editor" aria-label="Open checklist.md">
          checklist.md
        </button>
      </div>
    </div>

    ${this.issueFilter !== 'all' ? `
      <div style="padding: 4px 12px; background: rgba(59, 130, 246, 0.1); border-bottom: 1px solid var(--border); font-size: 10px; display: flex; justify-content: space-between; align-items: center;">
        <span>Filter active: <strong>${escapeHtml(String(this.issueFilter || '').toUpperCase())}</strong></span>
        <span style="cursor: pointer; color: var(--sev-info);" data-action="clear-filter" onclick="clearFilter()">Clear</span>
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

      window.addEventListener('message', function(event) {
        const message = event.data;
        if (message && message.type === 'highlightFinding' && message.findingId) {
          const cards = document.querySelectorAll('.finding-card');
          for (let i = 0; i < cards.length; i++) {
            cards[i].classList.remove('selected');
          }
          const target = document.querySelector('.finding-card[data-finding-id="' + message.findingId + '"]');
          if (target) {
            target.classList.add('selected');
            if (typeof target.scrollIntoView === 'function') {
              target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
        }
      });

      window.switchTab = function(tab) { post('switchTab', { tab: tab }); };
      window.openProjectOverview = function() { post('openProjectOverview'); };
      window.selectRuleSource = function(mode) { post('setRuleSource', { mode: mode }); };
      window.setFilter = function(filter) { post('setFilter', { filter: filter }); };
      window.clearFilter = function() { post('clearFilter'); };
      window.onSearch = function(input) { post('searchIssues', { query: input ? input.value : '' }); };
      window.toggleFinding = function(findingId) { post('toggleFinding', { findingId: findingId }); };
      let lastToggleTime = 0;
      let lastToggleCat = '';
      window.toggleCategory = function(category, event) {
        if (event) {
          if (event.stopPropagation) event.stopPropagation();
          if (event.preventDefault) event.preventDefault();
        }
        const now = Date.now();
        if (lastToggleCat === category && now - lastToggleTime < 180) {
          return;
        }
        lastToggleCat = category;
        lastToggleTime = now;

        // Immediate responsive accordion DOM collapse/expand
        try {
          const headerEl = (event && event.target && event.target.closest)
            ? event.target.closest('.cat-header')
            : document.querySelector('.cat-header[data-category="' + category + '"]');
          const groupEl = headerEl ? headerEl.closest('.cat-group') : null;
          if (groupEl) {
            const isCurrentlyCollapsed = groupEl.classList.contains('collapsed');
            if (isCurrentlyCollapsed) {
              groupEl.classList.remove('collapsed');
              groupEl.classList.add('expanded');
              const body = groupEl.querySelector('.cat-body');
              if (body) body.style.display = 'block';
              const emptyState = groupEl.querySelector('.security-empty-state');
              if (emptyState) emptyState.style.display = 'block';
              const chevron = groupEl.querySelector('.cat-chevron');
              if (chevron) chevron.textContent = '⌄';
            } else {
              groupEl.classList.remove('expanded');
              groupEl.classList.add('collapsed');
              const body = groupEl.querySelector('.cat-body');
              if (body) body.style.display = 'none';
              const emptyState = groupEl.querySelector('.security-empty-state');
              if (emptyState) emptyState.style.display = 'none';
              const chevron = groupEl.querySelector('.cat-chevron');
              if (chevron) chevron.textContent = '›';
            }
          }
        } catch (err) {
          console.error('[CraftLens] Accordion toggle error:', err);
        }

        post('toggleCategory', { category: category });
      };
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
      window.openMasterChecklist = function() {
        post('openMasterChecklist');
      };
      window.applySuggestedFix = function(findingId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        var targetBtn = event && event.currentTarget ? event.currentTarget : (event && event.target ? event.target : null);
        if (targetBtn) {
          if (targetBtn.getAttribute('aria-busy') === 'true' || targetBtn.disabled) {
            return;
          }
          targetBtn.disabled = true;
          targetBtn.setAttribute('aria-busy', 'true');
          targetBtn.textContent = 'Applying...';
          var card = targetBtn.closest('.finding-card');
          if (card) {
            card.classList.add('card-processing');
          }
        }
        post('applySuggestedFix', { findingId: findingId });
      };
      window.showManualFix = function(findingId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('showManualFix', { findingId: findingId });
      };
      window.showFindingDetail = function(findingId, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        post('showFindingDetail', { findingId: findingId });
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

      window.openIssuesFile = function() {
        post('openIssuesFile');
      };
      window.openProblemsFile = window.openIssuesFile;

      window.openSuggestionsFile = function() {
        post('openSuggestionsFile');
      };
      window.openSuggestionFile = window.openSuggestionsFile;

      window.openChangesFile = function() {
        post('openChangesFile');
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
            if (e && e.stopPropagation) e.stopPropagation();
            const cat = el.getAttribute('data-category');
            if (cat) window.toggleCategory(cat, e);
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
          case 'apply-suggested-fix': {
            e.stopPropagation();
            const fid = el.getAttribute('data-finding-id');
            if (fid) window.applySuggestedFix(fid, e);
            break;
          }
          case 'show-manual-fix': {
            e.stopPropagation();
            const fid = el.getAttribute('data-finding-id');
            if (fid) window.showManualFix(fid, e);
            break;
          }
          case 'open-master-checklist': {
            window.openMasterChecklist();
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
          case 'open-issues-file':
          case 'open-problems-file': {
            window.openIssuesFile();
            break;
          }
          case 'open-suggestions-file':
          case 'open-suggestion-file': {
            window.openSuggestionsFile();
            break;
          }
          case 'open-changes-file': {
            window.openChangesFile();
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
  private isSecurityFinding(f: Finding): boolean {
    if (f.category === 'security' || (f.category as any) === 'sec') return true;
    const ruleId = (f.ruleId || '').toUpperCase();
    if (ruleId.startsWith('SEC-') || /security|xss|csrf|sqli|inject|secret|auth|perm/i.test(ruleId)) return true;
    const title = f.title || f.problemTitle || '';
    if (/security|vulnerability|credential|secret|auth|xss|injection|csrf|idor|hardcoded key/i.test(title)) return true;
    return false;
  }

  private maskSensitiveSnippet(snippet: string, isSecurity: boolean): string {
    if (!isSecurity || !snippet) return snippet;
    return snippet
      .replace(/(ghp_[a-zA-Z0-9]{36})/g, (m) => m.slice(0, 4) + '••••••••••••••••••••••••••••••••' + m.slice(-4))
      .replace(/(sk-[a-zA-Z0-9]{20,})/g, (m) => m.slice(0, 3) + '••••••••••••••••' + m.slice(-3))
      .replace(/(AKIA[0-9A-Z]{16})/g, (m) => m.slice(0, 4) + '••••••••••••' + m.slice(-4))
      .replace(/((?:api[_-]?key|secret|token|password|bearer|auth)["']?\s*[:=]\s*["'])([^"'•]{8,})(["'])/gi, '$1••••••••$3');
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Findings View (Section 1, 2, 3, 21)
  // ─────────────────────────────────────────────────────────────
  private getRecommendationState(f: Finding): {
    exists: boolean;
    text?: string;
    skillId?: string;
    whyItMatters?: string;
    evidence?: string[];
    automaticFixAvailable: boolean;
    changeId?: string;
    primarySug?: Suggestion;
  } {
    const fixCap = this.findingStore.getFixCapability(f, this.projectContext, this.engine?.getSkillManager());
    const suggestions: Suggestion[] = (f.suggestions && f.suggestions.length > 0)
      ? f.suggestions
      : ContextAwareFixGenerator.generateSuggestions(f, this.projectContext);

    const primarySug = suggestions[0];
    const automaticFixAvailable = fixCap.canApply;

    const text =
      fixCap.suggestion ||
      primarySug?.explanation ||
      primarySug?.title ||
      f.howToFix ||
      f.recommendation ||
      (f.recommendations && f.recommendations.length > 0 ? f.recommendations[0].description : undefined);

    const exists = Boolean(text && text.trim().length > 0);
    const whyItMatters = fixCap.whyItMatters || f.whyItMatters || f.why || f.description || '';
    const evidence = f.evidence?.map(e => e.explanation || e.snippet || '').filter(Boolean) || [];
    const changeId = fixCap.fixId || (f.fix as any)?.id || f.designFix?.id || primarySug?.id;
    const skillId = fixCap.skillId || f.sourceSkillId || (f as any).skillId || f.clusterId || f.category;

    return {
      exists,
      text: text?.trim(),
      skillId,
      whyItMatters,
      evidence,
      automaticFixAvailable,
      changeId,
      primarySug,
    };
  }

  private renderIssuesView(findings: Finding[], totalIssues: number): string {
    if (totalIssues === 0) {
      return `
        <div style="padding: 32px 16px; text-align: center; color: var(--muted);">
          <div style="font-size: 13px; font-weight: 600; color: var(--header-fg); margin-bottom: 4px;">No Quality Slop Detected</div>
          <div style="font-size: 10.5px; margin-bottom: 12px;">Scanned: UI / UX · Design Tokens · Accessibility · Code Quality · Security</div>
        </div>
      `;
    }

    const securityFindings = findings.filter(f => this.isSecurityFinding(f));

    interface AuditCategoryDef {
      id: string;
      label: string;
      match: (f: Finding) => boolean;
      isSecurity?: boolean;
    }

    const categories: AuditCategoryDef[] = [
      {
        id: 'ui-ux',
        label: 'UI / UX',
        match: f => !this.isSecurityFinding(f) && (f.category === 'ui-ux' || f.category === 'design' || f.category === 'ui' || f.category === 'visual' || f.category === 'hierarchy' || f.category === 'interaction' || f.category === 'css'),
      },
      {
        id: 'security',
        label: 'Security',
        match: f => this.isSecurityFinding(f),
        isSecurity: true,
      },
      {
        id: 'performance',
        label: 'Performance',
        match: f => !this.isSecurityFinding(f) && (f.category === 'performance' || f.category === 'perf'),
      },
      {
        id: 'code-quality',
        label: 'Code Quality',
        match: f => !this.isSecurityFinding(f) && (f.category === 'code-quality' || f.category === 'backend' || f.category === 'tech' || f.category === 'code' || f.category === 'architecture' || !f.category),
      },
      {
        id: 'accessibility',
        label: 'Accessibility',
        match: f => !this.isSecurityFinding(f) && (f.category === 'accessibility' || f.category === 'a11y'),
      },
      {
        id: 'dependencies',
        label: 'Dependencies',
        match: f => !this.isSecurityFinding(f) && (f.category === 'dependencies' || f.category === 'dependency' || f.category === 'deps' || f.category === 'dep'),
      },
      {
        id: 'content',
        label: 'Content',
        match: f => !this.isSecurityFinding(f) && (f.category === 'content' || f.category === 'copy' || f.category === 'placeholder'),
      },
    ];

    const matchedFindingIds = new Set<string>();
    for (const cat of categories) {
      for (const f of findings) {
        if (cat.match(f)) matchedFindingIds.add(f.id || f.ruleId || '');
      }
    }
    const unmatchedFindings = findings.filter(f => !matchedFindingIds.has(f.id || f.ruleId || ''));
    if (unmatchedFindings.length > 0) {
      const otherCatMap = new Map<string, Finding[]>();
      for (const f of unmatchedFindings) {
        const catKey = (f.category || 'other').toLowerCase();
        if (!otherCatMap.has(catKey)) otherCatMap.set(catKey, []);
        otherCatMap.get(catKey)!.push(f);
      }
      for (const [catKey, fList] of otherCatMap.entries()) {
        const label = catKey.charAt(0).toUpperCase() + catKey.slice(1);
        categories.push({
          id: catKey,
          label: label,
          match: f => otherCatMap.get(catKey)?.some(other => (other.id || other.ruleId) === (f.id || f.ruleId)) ?? false,
        });
      }
    }

    const hasActiveFilter = this.issueFilter !== 'all' || Boolean(this.issueSearchQuery);

    return `
      <div style="display: flex; gap: 6px; padding: 6px 12px; background: var(--surface); border-bottom: 1px solid var(--border-subtle); align-items: center; flex-wrap: wrap;">
        <span style="font-size: 10px; color: var(--muted); font-weight: 600;">Reports:</span>
        <button class="btn-control" onclick="openIssuesFile()" data-action="open-issues-file" title="Open issues.md in editor" aria-label="View issues.md">
          View issues.md
        </button>
        <button class="btn-control" onclick="openSuggestionsFile()" data-action="open-suggestions-file" title="Open suggestions.md in editor" aria-label="View suggestions.md">
          View suggestions.md
        </button>
        <button class="btn-control" onclick="openChangesFile()" data-action="open-changes-file" title="Open changes.md in editor" aria-label="View changes.md">
          View changes.md
        </button>
      </div>

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
          ${hasActiveFilter ? '<span class="filter-tag" style="color: var(--status-error);" data-action="clear-filter" onclick="clearFilter()">Clear</span>' : ''}
        </div>
      </div>

      ${categories.map(cat => {
        const catFindings = findings.filter(f => cat.match(f));
        if (catFindings.length === 0 && !cat.isSecurity) return '';
        const isCatExpanded = this.expandedCategories.has(cat.id);
        const catSeverities = catFindings.map(f => toSemanticSeverity(f.severity));
        const highestSev = catSeverities.includes('error') ? 'Critical' : catSeverities.includes('warning') ? 'Warning' : 'Info';

        return `
          <div class="cat-group ${cat.isSecurity ? 'security-audit-section' : ''}">
            <div class="cat-header ${cat.isSecurity ? 'security-cat-header' : ''}"
                 data-action="toggle-category"
                 data-category="${cat.id}"
                 onclick="toggleCategory('${cat.id}', event)">
              <div class="cat-header-title">
                <span class="cat-chevron">${isCatExpanded ? '⌄' : '›'}</span>
                ${cat.id === 'ui-ux' ? `
                  <span class="cat-icon">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="color: var(--vscode-foreground);">
                      <path d="m14.54 6.84-5.38-5.38a1.5 1.5 0 0 0-2.12 0l-5.66 5.66a1.5 1.5 0 0 0 0 2.12l3.54 3.54a1.5 1.5 0 0 0 2.12 0l1.41-1.41 1.06 1.06-.71.71a.5.5 0 0 0 .71.71l2.83-2.83a.5.5 0 0 0-.71-.71l-.71.71-1.06-1.06 4.67-4.67a1.5 1.5 0 0 0 0-2.12v-.35zm-6.09-4.67a.5.5 0 0 1 .71 0l5.38 5.38a.5.5 0 0 1 0 .71l-1.06 1.06-5.38-5.38.35-.35v-1.42zm-1.06 1.06 5.38 5.38-4.67 4.67a.5.5 0 0 1-.71 0l-3.54-3.54a.5.5 0 0 1 0-.71l3.54-3.54v-2.26z"/>
                    </svg>
                  </span>
                ` : ''}
                ${cat.isSecurity ? `
                  <span class="cat-icon">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="color: var(--sev-error);">
                      <path fill-rule="evenodd" clip-rule="evenodd" d="M8 1l6 2.5v4.5c0 4.15-2.6 7.74-6 8.95-3.4-1.21-6-4.8-6-8.95V3.5L8 1zm0 1.25L3 4.33v3.42c0 3.32 2.08 6.2 5 7.21 2.92-1.01 5-3.89 5-7.21V4.33L8 2.25z"/>
                    </svg>
                  </span>
                ` : ''}
                <span class="cat-title-text" style="${cat.isSecurity ? 'font-weight: 700; color: var(--header-fg);' : ''}">${cat.label}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                ${catFindings.length > 0 ? `<span class="cat-sev-pill cat-sev--${highestSev.toLowerCase()}">${highestSev}</span>` : ''}
                <span class="cat-badge" style="${cat.isSecurity && catFindings.length > 0 ? 'background: rgba(239, 68, 68, 0.2); color: var(--status-error); border: 1px solid rgba(239, 68, 68, 0.4);' : ''}">${catFindings.length}</span>
              </div>
            </div>
            ${isCatExpanded ? (
              catFindings.length > 0
                ? `<div class="cat-body">${catFindings.map(f => this.renderFindingCard(f, cat.isSecurity)).join('')}</div>`
                : cat.isSecurity
                  ? `<div class="security-empty-state" style="padding: 10px 12px; font-size: 11px; color: var(--muted); font-style: italic;">No security vulnerabilities detected.</div>`
                  : ''
            ) : ''}
          </div>
        `;
      }).join('')}
    `;
  }

  /**
   * Finding card formatted strictly according to Section 21 and Section 1, 2, 3.
   */
  private renderFindingCard(f: Finding, forceSecurity = false): string {
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

    const isSecurity = forceSecurity || this.isSecurityFinding(f);
    const semSev = isSecurity ? 'error' : toSemanticSeverity(f.severity);

    // Determine badge text strictly by severity & security category (Section 2 & 3)
    let badgeText = 'SUGGESTION';
    if (isSecurity) {
      badgeText = 'SECURITY';
    } else if (semSev === 'error') {
      if (f.severity === 'critical' || f.severity === 'blocker') {
        badgeText = 'CRITICAL';
      } else {
        badgeText = 'ERROR';
      }
    } else if (semSev === 'warning') {
      badgeText = 'WARNING';
    } else if (semSev === 'moderate') {
      badgeText = f.severity === 'medium' ? 'MEDIUM' : 'MODERATE';
    } else {
      badgeText = f.severity === 'low' ? 'LOW' : 'SUGGESTION';
    }

    const loc = f.location || f.primaryLocation;
    const filePath = f.filePath || loc?.filePath || '';
    const fileName = filePath ? path.basename(filePath) : 'file';
    const startLine = f.startLine || (loc as any)?.start?.line || (loc as any)?.range?.startLine || 1;
    const locText = `${fileName}:${startLine}`;

    const snippet = f.evidence?.[0]?.snippet || '';
    const maskedSnippet = this.maskSensitiveSnippet(snippet, isSecurity);

    const suggestions: Suggestion[] = (f.suggestions && f.suggestions.length > 0)
      ? f.suggestions
      : ContextAwareFixGenerator.generateSuggestions(f, this.projectContext);

    // Contextual Title & Explanation (Section 4)
    const issueTitle = f.problemTitle || f.title || f.whatIsWrong || f.ruleId;
    let explanation = f.whatIsWrong || f.message || f.description || '';
    if (explanation === issueTitle && f.whyItMatters) {
      explanation = f.whyItMatters;
    }

    const recState = this.getRecommendationState(f);
    const isManualOnly = ((f.fix as any) === 'manual' || (f.fix as any)?.kind === 'manual') || (recState.primarySug && recState.primarySug.type === 'manual' && !recState.automaticFixAvailable);

    return `
      <div class="finding-card ${isSelected ? 'selected' : ''} finding--${semSev} ${isSecurity ? 'finding--security' : ''}" data-finding-id="${escapeHtml(f.id || f.ruleId)}">
        <!-- 1. Inline Issue Label: Severity Badge & Location (Single location case) -->
        <div class="finding-label-row">
          <span class="sev-badge ${semSev}">${escapeHtml(badgeText)}</span>
          ${!hasMultipleInstances ? `
            <span class="finding-location-single">
              <span class="finding-location-link"
                    onclick="openInstance('${f.id || f.ruleId}', 0, '${escapeHtml(filePath)}', ${startLine}, event)"
                    data-action="open-instance"
                    data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                    data-instance-index="0"
                    data-file-path="${escapeHtml(filePath)}"
                    data-line="${startLine}"
                    title="Open in editor at line ${startLine}">
                ${escapeHtml(locText)}
              </span>
            </span>
          ` : ''}
        </div>

        <!-- 2. Issue Title (Clickable Navigation Target) -->
        <div class="finding-title-row"
             onclick="openInstance('${f.id || f.ruleId}', 0, '${escapeHtml(filePath)}', ${startLine}, event)"
             data-action="open-instance"
             data-finding-id="${escapeHtml(f.id || f.ruleId)}"
             data-instance-index="0"
             data-file-path="${escapeHtml(filePath)}"
             data-line="${startLine}"
             title="Open ${escapeHtml(locText)} in editor">
          <span class="finding-title-text sev-title--${semSev} clickable-title">${escapeHtml(issueTitle)}</span>
        </div>

        <!-- Multiple Locations Stacked List (when multiple files exist) -->
        ${hasMultipleInstances ? `
          <div class="finding-locations-stacked">
            ${rawInstances.map((inst, idx) => {
              const instFilePath = inst.filePath || filePath;
              const instFileName = instFilePath ? path.basename(instFilePath) : fileName;
              const instLine = inst.line || (inst.location as any)?.start?.line || (inst.location as any)?.range?.startLine || startLine;
              const displayPath = instFilePath ? (instFilePath.includes('/') ? instFilePath.replace(/^.*?\/([^/]+\/[^/]+)$/, '$1') : instFileName) : instFileName;
              return `
                <div class="stacked-location-item">
                  <span class="finding-location-link"
                        onclick="openInstance('${f.id || f.ruleId}', ${idx}, '${escapeHtml(instFilePath)}', ${instLine}, event)"
                        data-action="open-instance"
                        data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                        data-instance-index="${idx}"
                        data-file-path="${escapeHtml(instFilePath)}"
                        data-line="${instLine}"
                        title="Open in editor at line ${instLine}">
                    ${escapeHtml(displayPath)}:${instLine}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <!-- 3. Short explanation / details -->
        ${explanation ? `
          <div class="finding-short-desc">${escapeHtml(explanation)}</div>
        ` : ''}

        ${isSecurity && f.whyItMatters ? `
          <div class="security-why-matters"><strong>Why it matters:</strong> ${escapeHtml(f.whyItMatters)}</div>
        ` : ''}

        <!-- 4. Suggested Fix (Above Code) -->
        ${recState.exists ? `
          <div class="finding-fix-preview${!recState.automaticFixAvailable ? ' clickable-fix-preview' : ''}"
               ${!recState.automaticFixAvailable ? `onclick="showFindingDetail('${f.id || f.ruleId}', event)" data-action="show-finding-detail" data-finding-id="${escapeHtml(f.id || f.ruleId)}" title="Click to view full recommendation in bottom panel"` : ''}>
            <span class="fix-preview-label">Suggested Fix:</span>
            ${recState.automaticFixAvailable ? `
              ${recState.text ? `<span class="fix-preview-text" onclick="showFindingDetail('${f.id || f.ruleId}', event)" style="cursor: pointer;" title="Click for details in bottom panel">${escapeHtml(recState.text)}</span>` : ''}
              <div class="finding-actions-row" style="margin-top: 6px;">
                <button class="btn btn-primary fix-action-btn"
                        data-action="apply-suggested-fix"
                        data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                        title="Apply contextual fix"
                        onclick="applySuggestedFix('${f.id || f.ruleId}', event)">
                  Apply Fix
                </button>
                <button class="btn btn-quiet reject-action-btn"
                        data-action="reject-finding"
                        data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                        title="Reject finding"
                        onclick="rejectFinding('${f.id || f.ruleId}', event)">
                  Reject
                </button>
              </div>
            ` : `
              <span class="fix-preview-text fix-preview-clickable">${escapeHtml(recState.text)}</span>
              <div class="finding-actions-row" style="margin-top: 6px;">
                ${isManualOnly ? `
                  <button class="btn btn-secondary"
                          data-action="show-finding-detail"
                          data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                          title="Manual fix required"
                          onclick="showFindingDetail('${f.id || f.ruleId}', event)">
                    Manual fix
                  </button>
                ` : ''}
                <button class="btn btn-quiet reject-action-btn"
                        data-action="reject-finding"
                        data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                        title="Reject finding"
                        onclick="rejectFinding('${f.id || f.ruleId}', event)">
                  Reject
                </button>
              </div>
            `}
          </div>
        ` : `
          <div class="finding-actions-row">
            <button class="btn btn-quiet reject-action-btn"
                    data-action="reject-finding"
                    data-finding-id="${escapeHtml(f.id || f.ruleId)}"
                    title="Reject finding"
                    onclick="rejectFinding('${f.id || f.ruleId}', event)">
              Reject
            </button>
          </div>
        `}

        <!-- 5. Affected code snippet box with matching severity accenting (Below Suggested Fix) -->
        ${snippet ? `
          <div class="code-snippet-box"><code>${escapeHtml(maskedSnippet)}</code></div>
        ` : ''}

        <!-- Existing Design Token Detection (Section 20 & 21) -->
        ${f.detectedToken ? `
          <div class="token-callout">
            <span>Existing design token detected:</span>
            <strong style="color: var(--vscode-textLink-foreground, var(--sev-info)); font-family: var(--font-mono);">${escapeHtml(f.detectedToken.name.startsWith('--') ? f.detectedToken.name : '--' + f.detectedToken.name)}</strong>
          </div>
        ` : ''}

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

            <!-- Dynamic Alternative Suggestions -->
            ${suggestions.length > 1 ? `
              <div class="suggestions-block">
                <div class="suggestions-header">Alternative Directions (${suggestions.length})</div>
                ${suggestions.slice(1).map((sug, idx) => `
                  <div class="suggestion-card">
                    <div class="sug-title-row">
                      <span class="sug-icon">${idx + 2}.</span>
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
                              data-suggestion-index="${idx + 1}"
                              data-replacement="${escapeHtml(sug.replacement || '')}"
                              onclick="applySuggestion('${f.id || f.ruleId}', ${idx + 1}, '', event)">
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
                Reject
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
                <span style="color: var(--status-success);">Enabled</span>
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
          ${skill.hasExecutableAssets ? `<div style="color: var(--sev-warning);">Bundled scripts are quarantined and not executed.</div>` : ''}
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
            <button class="btn-control delete-btn" style="color: var(--status-error);" data-action="delete-skill" data-skill-id="${escapeHtml(skill.id)}" onclick="deleteSkillAction('${escapeHtml(skill.id)}', event)">Remove</button>
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
          <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
            <button class="btn-control" onclick="openChecklistFile()" data-action="open-checklist" title="Open source checklist.md in editor" aria-label="View checklist.md">
              View checklist.md
            </button>
            <button class="btn-control" onclick="openIssuesFile()" data-action="open-issues-file" title="Open source issues.md in editor" aria-label="View issues.md">
              issues.md
            </button>
            <button class="btn-control" onclick="openSuggestionsFile()" data-action="open-suggestions-file" title="Open source suggestions.md in editor" aria-label="View suggestions.md">
              suggestions.md
            </button>
            <button class="btn-control" onclick="openChangesFile()" data-action="open-changes-file" title="Open source changes.md in editor" aria-label="View changes.md">
              changes.md
            </button>
          </div>
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
        <div style="font-size: 10px; color: var(--muted); margin-bottom: 12px;">
          Auto-Audit on Save & Change
        </div>
        <div style="font-size: 11px; font-weight: 600; color: var(--header-fg); margin-bottom: 6px;">
          Living Project Documents
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <button class="btn-control" style="width: 100%; text-align: left;" onclick="openIssuesFile()" data-action="open-issues-file">
            View issues.md
          </button>
          <button class="btn-control" style="width: 100%; text-align: left;" onclick="openSuggestionsFile()" data-action="open-suggestions-file">
            View suggestions.md
          </button>
          <button class="btn-control" style="width: 100%; text-align: left;" onclick="openChangesFile()" data-action="open-changes-file">
            View changes.md
          </button>
          <button class="btn-control" style="width: 100%; text-align: left;" onclick="openChecklistFile()" data-action="open-checklist">
            View checklist.md
          </button>
        </div>
      </div>
    `;
  }
}
