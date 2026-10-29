import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  Finding,
  SidebarFinding,
  formatConfidenceLabel,
  formatConfidencePercent,
  normalizeFindingLocation,
  DesignRecommendation,
  SkillDiscoveryService,
  Skill,
  SkillManager,
  toSemanticSeverity,
  FindingStore,
  resolveFixCapability,
} from '@craftlens/core';

export class CraftLensDetailViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'craftlens.detailPanel';

  private _view?: vscode.WebviewView;
  private viewDisposables: vscode.Disposable[] = [];
  private currentFinding?: SidebarFinding;
  private currentRawFinding?: Finding;
  private currentRecommendations?: DesignRecommendation[];
  private currentInstanceIndex: number = 0;
  private showDetails: boolean = false;
  private showAllRelatedSkills: boolean = false;
  private discoveryService = new SkillDiscoveryService();
  private findingStore?: FindingStore;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private skillManager?: SkillManager
  ) {}

  public setFindingStore(store: FindingStore): void {
    this.findingStore = store;
    const unsub = this.findingStore.onDidSelectIssue((issueId) => {
      if (issueId) {
        const finding = this.findingStore?.getFindingById(issueId);
        if (finding) {
          this.showFinding(finding);
        }
      } else {
        this.clearFinding();
      }
    });
    this.viewDisposables.push({ dispose: unsub });
  }

  public clearFinding(): void {
    this.currentFinding = undefined;
    this.currentRawFinding = undefined;
    this.currentRecommendations = undefined;
    if (this._view) {
      this.updateHtml();
    }
  }

  public dispose(): void {
    this.disposeView();
  }

  private disposeView(): void {
    for (const d of this.viewDisposables) {
      try {
        d.dispose();
      } catch (err) {
        console.error('[CraftLens] Error disposing detail panel view disposable:', err);
      }
    }
    this.viewDisposables = [];
  }

  public setSkillManager(skillManager: SkillManager): void {
    this.skillManager = skillManager;
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
      localResourceRoots: [this.extensionUri],
    };

    const messageListener = webviewView.webview.onDidReceiveMessage(async (message: any) => {
      if (!message) return;
      const messageType = message.type || message.action || message.event || message.command;
      try {
        switch (messageType) {
          case 'add':
          case 'addSkill':
          case 'add-skill':
            await vscode.commands.executeCommand('craftlens.addSkill', message);
            break;

          case 'openLocation':
            if (this.currentFinding) {
              await vscode.commands.executeCommand(
                'craftlens.openFindingLocation',
                this.currentFinding.id,
                this.currentInstanceIndex
              );
            }
            break;

        case 'previousInstance':
          if (this.currentFinding && this.currentFinding.locations && this.currentFinding.locations.length > 1) {
            const newIndex =
              this.currentInstanceIndex > 0
                ? this.currentInstanceIndex - 1
                : this.currentFinding.locations.length - 1;
            this.currentInstanceIndex = newIndex;
            await vscode.commands.executeCommand(
              'craftlens.openFindingLocation',
              this.currentFinding.id,
              newIndex
            );
            this.updateHtml();
          }
          break;

        case 'nextInstance':
          if (this.currentFinding && this.currentFinding.locations && this.currentFinding.locations.length > 1) {
            const newIndex =
              this.currentInstanceIndex < this.currentFinding.locations.length - 1
                ? this.currentInstanceIndex + 1
                : 0;
            this.currentInstanceIndex = newIndex;
            await vscode.commands.executeCommand(
              'craftlens.openFindingLocation',
              this.currentFinding.id,
              newIndex
            );
            this.updateHtml();
          }
          break;

        case 'applyFix':
          if (this.currentFinding) {
            const raw = this.currentRawFinding;
            const loc = this.getCurrentLocation();
            if (raw && raw.suggestions && raw.suggestions.length > 0 && raw.suggestions[0].safe) {
              await vscode.commands.executeCommand('craftlens.applySuggestion', raw.id || this.currentFinding.id, 0);
            } else if (loc?.filePath) {
              await vscode.commands.executeCommand(
                'craftlens.applyQuickFix',
                vscode.Uri.file(loc.filePath),
                this.currentRawFinding || this.currentFinding
              );
            }
          }
          break;

        case 'previewFix':
          if (this.currentFinding) {
            const loc = this.getCurrentLocation();
            if (loc?.filePath) {
              await vscode.commands.executeCommand(
                'craftlens.previewDesignFix',
                vscode.Uri.file(loc.filePath),
                this.currentRawFinding || this.currentFinding
              );
            }
          }
          break;

        case 'ignoreFinding':
          if (this.currentFinding) {
            await vscode.commands.executeCommand(
              'craftlens.rejectFinding',
              this.currentRawFinding || this.currentFinding
            );
          }
          break;

        case 'suggestBetterDesign':
          await vscode.commands.executeCommand(
            'craftlens.suggestBetterDesign',
            this.currentRawFinding || this.currentFinding
          );
          break;

        case 'previewRecommendation':
          if (this.currentRecommendations && this.currentRecommendations[message.index]) {
            await vscode.commands.executeCommand(
              'craftlens.previewRecommendation',
              this.currentRawFinding || this.currentFinding,
              this.currentRecommendations[message.index]
            );
          }
          break;

        case 'applyRecommendation':
          if (this.currentRecommendations && this.currentRecommendations[message.index]) {
            await vscode.commands.executeCommand(
              'craftlens.applyRecommendation',
              this.currentRawFinding || this.currentFinding,
              this.currentRecommendations[message.index]
            );
          }
          break;

        case 'rejectRecommendation':
          await vscode.commands.executeCommand(
            'craftlens.rejectFinding',
            this.currentRawFinding || this.currentFinding
          );
          break;

        case 'applySpecificSuggestion':
          if (this.currentFinding) {
            const loc = this.getCurrentLocation();
            if (loc?.filePath && message.replacement) {
              const line = (loc as any)?.range?.startLine ?? (loc as any)?.start?.line ?? 1;
              await vscode.commands.executeCommand('craftlens.applySuggestion', {
                filePath: loc.filePath,
                line,
                replacement: message.replacement,
              });
            }
          }
          break;

        case 'copySuggestionFixText':
          if (message.text) {
            await vscode.commands.executeCommand('craftlens.copySuggestionFix', message.text);
          }
          break;

        case 'toggleDetails':
          this.showDetails = !this.showDetails;
          this.updateHtml();
          break;

        case 'installSkill': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            await vscode.commands.executeCommand('craftlens.installSkill', sid, false);
            this.updateHtml();
          }
          break;
        }

        case 'activateSkill': {
          const sid = message.skillId || message.id || message.skill?.id || (typeof message.skill === 'string' ? message.skill : undefined);
          if (sid) {
            await vscode.commands.executeCommand('craftlens.installSkill', sid, true);
            this.updateHtml();
          }
          break;
        }

        case 'toggleRelatedSkills':
          this.showAllRelatedSkills = !this.showAllRelatedSkills;
          this.updateHtml();
          break;
      }
    } catch (err: any) {
      console.error('[CraftLens] Detail panel event handling failure:', {
        eventName: messageType,
        eventSource: 'webview.craftlens.detailPanel',
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

  public showBetterDesign(finding: Finding, recommendations: DesignRecommendation[]): void {
    this.currentRecommendations = recommendations;
    this.showFinding(finding);
  }

  public showFinding(
    finding: SidebarFinding | Finding,
    rawFindingOrSection?: Finding | string,
    instanceIndex: number = 0
  ): void {
    const rawFinding = typeof rawFindingOrSection === 'object' ? rawFindingOrSection : undefined;
    if ('category' in finding && typeof (finding as any).category === 'string' && (finding as any).summary) {
      this.currentFinding = finding as SidebarFinding;
      this.currentRawFinding = rawFinding || (finding as any);
      if (!this.currentRecommendations && (finding as any).recommendations) {
        this.currentRecommendations = (finding as any).recommendations;
      }
    } else {
      // Convert raw finding to SidebarFinding representation
      const raw = finding as Finding;
      const loc = normalizeFindingLocation(raw);
      this.currentFinding = {
        id: raw.fingerprint || raw.ruleId,
        category: raw.ruleId.startsWith('SEC-') || raw.category === 'security' ? 'security' : raw.ruleId.startsWith('UI-') || raw.ruleId.startsWith('CP-') || raw.ruleId.startsWith('VH-') || raw.category === 'ui-ux' ? 'ui' : 'backend',
        title: raw.problemTitle || raw.title || raw.message,
        summary: raw.whatIsWrong || raw.message,
        severity: raw.severity === 'blocker' ? 'critical' : raw.severity === 'error' ? 'high' : raw.severity === 'warning' ? 'medium' : 'low',
        instances: raw.instances?.length || 1,
        location: loc,
        locations: raw.instances?.map(inst => normalizeFindingLocation(inst) || loc).filter(Boolean) as any || (loc ? [loc] : []),
        why: raw.whyItMatters || raw.why || raw.description || raw.whatIsWrong || '',
        evidence: raw.evidence?.map(e => e.explanation || e.snippet || '').filter(Boolean) || [],
        recommendation: raw.howToFix || raw.recommendation || raw.suggestions?.[0]?.explanation || '',
        suggestedApproach: undefined,
        verification: raw.verification,
        signals: raw.signals?.map(s => `${s.type}: ${typeof s.value === 'string' ? s.value : JSON.stringify(s.value)}`),
        falsePositiveNote: raw.falsePositiveNote,
        affectedComponents: raw.affectedComponents,
        route: raw.route,
        fix: raw.designFix ? { type: 'assisted', description: raw.designFix.description } : raw.fix ? { type: raw.fix.kind === 'safe' ? 'safe' : 'assisted', description: raw.fix.title } : undefined,
        ruleId: raw.ruleId,
        confidence: raw.confidence,
      };
      this.currentRawFinding = raw;
      if (!this.currentRecommendations && raw.recommendations && raw.recommendations.length > 0) {
        this.currentRecommendations = raw.recommendations;
      }
    }

    this.currentInstanceIndex = instanceIndex;

    if (this._view) {
      this._view.show(true);
      this.updateHtml();
    } else {
      vscode.commands.executeCommand('craftlens.detailPanel.focus');
    }
  }

  public getCurrentFinding(): SidebarFinding | undefined {
    return this.currentFinding;
  }

  private getCurrentLocation() {
    if (!this.currentFinding) return undefined;
    if (this.currentFinding.locations && this.currentFinding.locations[this.currentInstanceIndex]) {
      return this.currentFinding.locations[this.currentInstanceIndex];
    }
    return this.currentFinding.location;
  }

  private updateHtml(): void {
    if (!this._view) return;
    this._view.webview.html = this.renderHtml();
  }

  private renderHtml(): string {
    if (!this.currentFinding) {
      return this.renderEmptyState();
    }

    const f = this.currentFinding;
    const loc = this.getCurrentLocation();
    const filename = loc?.filePath ? path.basename(loc.filePath) : '';
    const line = loc?.range?.startLine ? `line ${loc.range.startLine}` : '';
    const locStr = [filename, line].filter(Boolean).join(' · ');

    const totalInstances = f.locations && f.locations.length > 0 ? f.locations.length : f.instances || 1;
    const currentInstanceNum = Math.min(this.currentInstanceIndex + 1, totalInstances);
    const hasMultipleInstances = totalInstances > 1;

    const categoryLabel =
      f.category === 'ui'
        ? 'UI / UX'
        : f.category === 'security'
        ? 'SECURITY'
        : 'BACKEND & TECH';

    const rawFix = this.currentRawFinding?.designFix || this.currentRawFinding?.fix;
    const hasFixChanges = Boolean(rawFix && Array.isArray(rawFix.changes) && rawFix.changes.length > 0);
    const firstChange = hasFixChanges && rawFix && rawFix.changes ? rawFix.changes[0] : null;
    const newTextSnippet = firstChange ? ('newText' in firstChange ? (firstChange as any).newText : (firstChange as any).after) : '';
    const oldTextSnippet = firstChange && 'before' in firstChange ? (firstChange as any).before : '';
    const fixTitle = rawFix?.title || 'Proposed Code Transformation';

    const rawForSkills: Finding = this.currentRawFinding || ({
      ruleId: f.ruleId || f.id,
      title: f.title,
      message: f.summary,
      category: f.category,
    } as any);

    const installedSkillsList = this.skillManager ? this.skillManager.getAllSkillsAsSkills() : [];
    const relatedLimit = this.showAllRelatedSkills ? 8 : 3;
    const relatedSkills = this.discoveryService.getRecommendedSkills({
      findings: [rawForSkills],
      installedSkills: installedSkillsList,
      limit: relatedLimit,
    });

    const relatedSkillsBlock = this.renderRelatedSkillsBlock(relatedSkills);

    const raw = this.currentRawFinding;
    const recommendationText = f.recommendation || raw?.howToFix || raw?.suggestions?.[0]?.explanation || f.suggestedApproach || (f.fix ? f.fix.description : '');
    const whyItMattersText = f.why || raw?.whyItMatters || raw?.whatIsWrong || f.summary || '';

    let skillName = 'General Quality';
    if (f.category === 'security' || f.ruleId?.startsWith('SEC-') || raw?.category === 'security') {
      skillName = 'Security Best Practices';
    } else if (f.category === 'ui' || f.ruleId?.startsWith('UI-') || f.ruleId?.startsWith('CP-') || f.ruleId?.startsWith('VH-') || raw?.category === 'ui-ux') {
      skillName = 'UI / UX Quality';
    } else if (f.category === 'accessibility' || f.ruleId?.startsWith('A11Y-')) {
      skillName = 'Accessibility Best Practices';
    } else if (f.category === 'performance' || f.ruleId?.startsWith('PERF-')) {
      skillName = 'Performance Optimization';
    } else if (f.category === 'backend' || f.ruleId?.startsWith('TECH-')) {
      skillName = 'Backend / Tech Quality';
    } else if (relatedSkills && relatedSkills.length > 0 && (relatedSkills[0] as any)?.name) {
      skillName = (relatedSkills[0] as any).name;
    }

    const fixCap = this.findingStore
      ? this.findingStore.getFixCapability(raw || f, undefined, this.skillManager)
      : resolveFixCapability(raw || f, this.skillManager);
    const automaticFixAvailable = fixCap.canApply;

    const evidenceItems: string[] = [];
    if (f.evidence && Array.isArray(f.evidence)) {
      for (const ev of f.evidence) {
        if (ev && typeof ev === 'string') evidenceItems.push(ev);
      }
    }
    if (evidenceItems.length === 0 && raw?.evidence && Array.isArray(raw.evidence)) {
      for (const ev of raw.evidence) {
        if (typeof ev === 'string') evidenceItems.push(ev);
        else if (ev?.explanation) evidenceItems.push(ev.explanation);
        else if (ev?.snippet) evidenceItems.push(ev.snippet);
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Issue Details</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --card-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      --border: var(--vscode-panel-border, var(--vscode-widget-border));
      --border-subtle: var(--vscode-panel-border);
      --link: var(--vscode-textLink-foreground);
      --muted: var(--vscode-descriptionForeground);
      --btn-primary-bg: var(--vscode-button-background);
      --btn-primary-fg: var(--vscode-button-foreground);
      --btn-primary-hover: var(--vscode-button-hoverBackground);
      --btn-sec-bg: var(--vscode-button-secondaryBackground);
      --btn-sec-fg: var(--vscode-button-secondaryForeground);
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground);
      --tag-bg: var(--vscode-badge-background, rgba(255, 255, 255, 0.05));
      --accent-pill: var(--vscode-textLink-foreground);
      --radius-sm: 2px;
      --radius-md: 2px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: 12px;
      line-height: 1.4;
      padding: 10px 14px 20px;
    }

    /* Header */
    .header {
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 10px;
    }

    .sev-category-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
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
    .sev-badge.error { background: rgba(239, 68, 68, 0.18); color: var(--vscode-errorForeground, var(--vscode-editorError-foreground)); border: 1px solid rgba(239, 68, 68, 0.4); }
    .sev-badge.warning { background: rgba(234, 179, 8, 0.18); color: var(--vscode-editorWarning-foreground, var(--vscode-charts-orange)); border: 1px solid rgba(234, 179, 8, 0.4); }
    .sev-badge.moderate { background: rgba(249, 115, 22, 0.18); color: var(--vscode-charts-orange, var(--vscode-editorWarning-foreground)); border: 1px solid rgba(249, 115, 22, 0.4); }
    .sev-badge.info { background: rgba(148, 163, 184, 0.15); color: var(--muted); border: 1px solid rgba(148, 163, 184, 0.3); }
    .sev-badge.info { background: rgba(59, 130, 246, 0.15); color: var(--vscode-editorInfo-foreground, currentColor); border: 1px solid rgba(59, 130, 246, 0.4); }

    .category-badge {
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .issue-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--fg);
      margin-bottom: 4px;
      line-height: 1.35;
    }

    .location-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 12px;
      color: var(--muted);
    }

    .location-link {
      color: var(--link);
      cursor: pointer;
      text-decoration: none;
    }

    .location-link:hover {
      text-decoration: underline;
    }

    .pager {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      background: var(--tag-bg);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
    }

    .pager-btn {
      background: transparent;
      border: none;
      color: var(--link);
      cursor: pointer;
      font-size: 11px;
      padding: 0 3px;
    }

    .pager-btn:hover {
      text-decoration: underline;
    }

    /* Core 4 Sections */
    .section-block {
      margin-bottom: 14px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .section-body {
      font-size: 13px;
      color: var(--fg);
      line-height: 1.5;
    }

    .evidence-list {
      list-style-type: none;
      padding-left: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .evidence-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 12.5px;
    }

    .evidence-bullet {
      color: var(--muted);
      line-height: 1.3;
    }

    .approach-box {
      background: var(--card-bg);
      border: 1px dashed var(--border);
      border-radius: 4px;
      padding: 8px 12px;
      font-size: 12.5px;
      color: var(--fg);
      margin-top: 4px;
      line-height: 1.4;
    }

    /* Action Toolbar */
    .action-bar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 10px;
      margin-top: 14px;
      border-top: 1px solid var(--border);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.12s ease;
      line-height: 1.4;
      user-select: none;
    }
    .btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    .btn-primary {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-fg);
      font-weight: 600;
    }
    .btn-primary:hover {
      background: var(--btn-primary-hover);
    }

    .btn-secondary {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: var(--btn-sec-hover);
      color: var(--fg);
    }

    .btn-quiet {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
    }
    .btn-quiet:hover {
      color: var(--fg);
      background: var(--tag-bg);
    }

    /* Fix Preview Card */
    .fix-preview-card {
      background: rgba(16, 185, 129, 0.07);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      margin: 10px 0 12px 0;
    }

    .fix-preview-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .fix-badge {
      background: var(--vscode-testing-iconPassed, var(--vscode-button-background));
      color: var(--vscode-button-foreground);
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .fix-title {
      font-weight: 600;
      color: var(--fg);
      font-size: 12px;
    }

    .diff-block {
      background: var(--vscode-editor-background);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-x: auto;
    }

    .diff-line {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 2px 4px;
      border-radius: var(--radius-sm);
      word-break: break-all;
    }

    .diff-del {
      background: rgba(239, 68, 68, 0.16);
      background: rgba(239, 68, 68, 0.08);
      color: var(--vscode-errorForeground, var(--vscode-editorError-foreground));
    }

    .diff-add {
      background: rgba(16, 185, 129, 0.16);
      background: rgba(16, 185, 129, 0.08);
      color: var(--vscode-testing-iconPassed);
    }

    .diff-sign {
      user-select: none;
      font-weight: 700;
      width: 10px;
    }

    /* Collapsible Details */
    .details-toggle {
      margin-top: 12px;
      padding-top: 6px;
      font-size: 11px;
      color: var(--muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .details-toggle:hover {
      color: var(--fg);
    }

    .details-box {
      margin-top: 6px;
      padding: 6px 10px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      color: var(--muted);
    }

    .details-row {
      display: flex;
      gap: 8px;
    }

    .details-label {
      font-weight: 600;
      color: var(--fg);
      min-width: 90px;
    }

    /* Better Design Card (Section 13, 14, 15) */
    .better-design-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-left: 2px solid var(--vscode-focusBorder, currentColor);
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      margin-bottom: 12px;
    }

    .better-design-badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--link);
      margin-bottom: 6px;
    }

    .better-design-meta {
      font-size: 11.5px;
      color: var(--muted);
      margin-bottom: 12px;
      line-height: 1.4;
    }

    .better-design-meta strong {
      color: var(--fg);
    }

    .rec-card {
      padding: 10px 0;
    }

    .rec-divider {
      border-top: 1px dashed var(--border);
      margin: 10px 0;
    }

    .rec-title-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 6px;
      gap: 8px;
    }

    .rec-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--fg);
      letter-spacing: 0.02em;
    }

    .rec-confidence {
      font-size: 11px;
      color: var(--vscode-testing-iconPassed);
      font-weight: 600;
      white-space: nowrap;
    }

    .rec-description {
      font-size: 12.5px;
      color: var(--fg);
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .rec-meta-block {
      margin-top: 6px;
    }

    .rec-meta-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 2px;
    }

    .rec-meta-body {
      font-size: 12px;
      color: var(--fg);
      line-height: 1.4;
    }

    .rec-meta-body.mono {
      font-family: monospace;
      color: var(--link);
      font-size: 11px;
    }

    .rec-evidence-list {
      list-style-type: none;
      padding-left: 0;
      font-size: 11.5px;
      color: var(--fg);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .rec-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    /* Related Skills for this Finding (Sections 5, 28, 29) */
    .related-skills-container {
      margin-top: 12px;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--card-bg);
    }
    .related-skills-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .related-skills-badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--link);
    }
    .related-skills-sub {
      font-size: 9.5px;
      color: var(--muted);
    }
    .related-skills-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .related-skill-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.02);
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .related-skill-row:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.18);
    }
    .related-skill-info {
      min-width: 0;
      flex: 1;
    }
    .related-skill-title-line {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .related-skill-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--fg);
    }
    .related-skill-version {
      font-size: 8.5px;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.06);
      padding: 1px 4px;
      border-radius: 2px;
    }
    .related-skill-source {
      font-size: 8.5px;
      color: var(--muted);
      text-transform: uppercase;
    }
    .related-skill-desc {
      font-size: 10px;
      color: var(--muted);
      margin-top: 2px;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .related-skill-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .btn-skill-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
      min-height: 24px;
      height: 24px;
      padding: 0 8px;
      font-size: 10.5px;
      font-weight: 500;
      border-radius: 4px;
      line-height: 1;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
      flex-shrink: 0;
    }
    .btn-skill-action.state-install {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border-color: var(--border);
    }
    .btn-skill-action.state-install:hover {
      background: var(--btn-sec-hover);
    }
    .btn-skill-action.state-activate {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-fg);
    }
    .btn-skill-action.state-activate:hover {
      background: var(--btn-primary-hover);
    }
    .btn-skill-action.state-active {
      background: rgba(16, 185, 129, 0.12);
      color: var(--vscode-testing-iconPassed);
      border-color: rgba(16, 185, 129, 0.25);
    }
    .related-more-btn {
      margin-top: 6px;
      background: transparent;
      border: none;
      color: var(--link);
      font-size: 10.5px;
      cursor: pointer;
      padding: 3px 0;
      text-align: left;
    }
    .related-more-btn:hover {
      text-decoration: underline;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="sev-category-row">
      <span class="sev-badge ${toSemanticSeverity(f.severity || 'info')}">${this.escapeHtml(String(f.severity || 'INFO').toUpperCase())}</span>
      <span class="category-badge">${this.escapeHtml(categoryLabel)}</span>
    </div>
    <div class="issue-title">${this.escapeHtml(f.title)}</div>
    <div class="location-row">
      <span class="location-link" onclick="openLocation()">${this.escapeHtml(locStr || 'Location in editor')}</span>
      ${
        hasMultipleInstances
          ? `
        <div class="pager">
          <span>${currentInstanceNum} of ${totalInstances}</span>
          <button class="pager-btn" onclick="previousInstance()">Previous</button>
          <button class="pager-btn" onclick="nextInstance()">Next</button>
        </div>
      `
          : ''
      }
    </div>
  </div>

  ${
    this.currentRecommendations && this.currentRecommendations.length > 0
      ? `
    <!-- BETTER DESIGN (Sections 13, 14, 15) -->
    <div class="better-design-container">
      <div class="better-design-header">
        <div class="better-design-badge">BETTER DESIGN</div>
        <div class="better-design-meta">
          <div><span style="color: var(--muted);">Based on:</span> <strong>${this.escapeHtml(f.title)}</strong></div>
          <div><span style="color: var(--muted);">Affected:</span> <strong>${this.escapeHtml(
            (this.currentRawFinding?.affectedElements && this.currentRawFinding.affectedElements.length > 0)
              ? `${this.currentRawFinding.affectedElements.length} ${this.currentRawFinding.affectedElements[0].className || this.currentRawFinding.affectedElements[0].selector || 'elements'}`
              : `${totalInstances} instances`
          )}</strong></div>
        </div>
      </div>

      <div class="recommendations-list">
        ${this.currentRecommendations.map((rec, idx) => `
          <div class="rec-card">
            <div class="rec-title-row">
              <span class="rec-title">${this.escapeHtml(rec.title)}</span>
              <span class="rec-confidence">Confidence ${Math.round((rec.confidence || 0.9) * 100)}%</span>
            </div>
            <div class="rec-description">${this.escapeHtml(rec.description)}</div>

            <div class="rec-meta-block">
              <div class="rec-meta-title">Why it fits</div>
              <div class="rec-meta-body">${this.escapeHtml(rec.whyItFits ? rec.whyItFits.join(' ') : '')}</div>
            </div>

            ${rec.evidence && rec.evidence.length > 0 ? `
              <div class="rec-meta-block">
                <div class="rec-meta-title">Evidence</div>
                <ul class="rec-evidence-list">
                  ${rec.evidence.map(ev => `<li>• ${this.escapeHtml(ev)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${rec.tradeoff ? `
              <div class="rec-meta-block">
                <div class="rec-meta-title">Tradeoff</div>
                <div class="rec-meta-body">${this.escapeHtml(rec.tradeoff)}</div>
              </div>
            ` : ''}

            ${rec.affectedElements && rec.affectedElements.length > 0 ? `
              <div class="rec-meta-block">
                <div class="rec-meta-title">Affected elements</div>
                <div class="rec-meta-body mono">${this.escapeHtml(rec.affectedElements.join(', '))}</div>
              </div>
            ` : ''}

            <div class="rec-actions">
              ${rec.fix?.type === 'safe' ? `
                <button class="btn btn-primary" onclick="applyRecommendation(${idx})">Apply Fix</button>
                <button class="btn btn-secondary" onclick="previewRecommendation(${idx})">Preview Fix</button>
              ` : (rec.fix?.type === 'assisted' || (rec.proposedChanges && rec.proposedChanges.length > 0) || ['hierarchize', 'distill', 'differentiate'].includes(rec.transformation)) ? `
                <button class="btn btn-primary" onclick="previewRecommendation(${idx})">Preview Fix</button>
                <button class="btn btn-secondary" onclick="applyRecommendation(${idx})">Apply</button>
              ` : `
                <button class="btn btn-secondary" onclick="applyRecommendation(${idx})">How to Improve</button>
              `}
              <button class="btn btn-quiet" onclick="rejectRecommendation(${idx})">Reject</button>
            </div>
          </div>
        `).join('<div class="rec-divider"></div>')}
      </div>
    </div>
  `
      : ''
  }

  <!-- SUGGESTED FIX -->
  <div class="section-block">
    <div class="section-title">Suggested Fix</div>
    <div class="section-body">${this.escapeHtml(recommendationText || 'No specific fix recommendation available for this finding.')}</div>
  </div>

  <!-- WHY IT MATTERS -->
  ${whyItMattersText ? `
  <div class="section-block">
    <div class="section-title">Why It Matters</div>
    <div class="section-body">${this.escapeHtml(whyItMattersText)}</div>
  </div>
  ` : ''}

  <!-- SKILL -->
  <div class="section-block">
    <div class="section-title">Skill</div>
    <div class="section-body">${this.escapeHtml(skillName)}</div>
  </div>

  <!-- EVIDENCE -->
  ${
    evidenceItems.length > 0
      ? `
    <div class="section-block">
      <div class="section-title">Evidence</div>
      <ul class="evidence-list">
        ${evidenceItems
          .map(
            ev => `
          <li class="evidence-item">
            <span class="evidence-bullet">•</span>
            <span>${this.escapeHtml(ev)}</span>
          </li>
        `
          )
          .join('')}
      </ul>
    </div>
  `
      : ''
  }

  <!-- AUTOMATIC FIX -->
  <div class="section-block">
    <div class="section-title">Automatic Fix</div>
    <div class="section-body">
      <div style="font-weight: 600; color: ${automaticFixAvailable ? 'var(--vscode-testing-iconPassed)' : 'var(--muted)'};">
        ${automaticFixAvailable ? 'Available' : 'Not available'}
      </div>
      ${automaticFixAvailable ? `
        <div style="display: flex; gap: 6px; margin-top: 6px;">
          <button class="btn btn-secondary" onclick="previewFix()">Preview Change</button>
          <button class="btn btn-primary" onclick="applyFix()">Apply Fix</button>
        </div>
      ` : ''}
    </div>
  </div>

  ${
    this.currentRawFinding?.detectedToken
      ? `
    <div class="section-block" style="border-left: 2px solid var(--vscode-textLink-foreground); padding-left: 8px;">
      <div class="section-title" style="color: var(--vscode-textLink-foreground);">Existing Design Token Detected</div>
      <div style="font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground); margin-top: 2px;">
        ${this.escapeHtml(
          this.currentRawFinding.detectedToken.name.startsWith('--')
            ? this.currentRawFinding.detectedToken.name
            : '--' + this.currentRawFinding.detectedToken.name
        )}
      </div>
    </div>
  `
      : ''
  }

  ${
    this.currentRawFinding?.suggestions && this.currentRawFinding.suggestions.length > 0
      ? `
    <div class="section-block">
      <div class="section-title">Contextual Fix Suggestions</div>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
        ${this.currentRawFinding.suggestions.slice(0, 3).map((sug, idx) => `
          <div style="background: var(--vscode-sideBar-background, rgba(255,255,255,0.03)); border: 1px solid var(--vscode-editorWidget-border, var(--border)); border-radius: 4px; padding: 8px;">
            <div style="font-weight: 600; font-size: 11px; margin-bottom: 2px;">${this.escapeHtml(sug.title)}</div>
            <div style="font-size: 10px; color: var(--muted); margin-bottom: 6px;">${this.escapeHtml(sug.explanation)}</div>
            ${sug.previewDiff ? `
              <pre style="background: rgba(0,0,0,0.25); padding: 4px; border-radius: 3px; font-size: 9.5px; overflow-x: auto; margin-bottom: 6px;"><code>${this.escapeHtml(sug.previewDiff)}</code></pre>
            ` : ''}
            <div style="display: flex; gap: 6px;">
              ${(sug.safe && sug.replacement) ? `
                <button class="btn btn-primary" onclick="applySpecificSuggestion(${idx}, '${this.escapeHtml(sug.replacement)}')">
                  ${this.escapeHtml(sug.actionLabel || 'Apply')}
                </button>
              ` : `
                <button class="btn btn-secondary" onclick="copySuggestionFixText('${this.escapeHtml(sug.replacement || '')}')">
                  ${this.escapeHtml(sug.actionLabel || 'Copy fix')}
                </button>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `
      : ''
  }

  ${
    hasFixChanges
      ? `
    <!-- PROPOSED CODE TRANSFORMATION -->
    <div class="fix-preview-card">
      <div class="fix-preview-header">
        <span class="fix-badge">Proposed Fix</span>
        <span class="fix-title">${this.escapeHtml(fixTitle)}</span>
      </div>
      <div class="diff-block">
        ${oldTextSnippet ? `<div class="diff-line diff-del"><span class="diff-sign">-</span><code>${this.escapeHtml(oldTextSnippet)}</code></div>` : ''}
        <div class="diff-line diff-add"><span class="diff-sign">+</span><code>${this.escapeHtml(newTextSnippet)}</code></div>
      </div>
    </div>
  `
      : ''
  }

  <!-- 5. VERIFICATION -->
  ${
    f.verification
      ? `
    <div class="section-block">
      <div class="section-title">Verification</div>
      <div class="section-body">${this.escapeHtml(f.verification)}</div>
    </div>
  `
      : ''
  }

  <!-- 6. SUGGESTED APPROACH (optional) -->
  ${
    f.suggestedApproach
      ? `
    <div class="section-block">
      <div class="section-title">Suggested Approach</div>
      <div class="approach-box">${this.escapeHtml(f.suggestedApproach)}</div>
    </div>
  `
      : ''
  }

  <!-- 7. ACTION TOOLBAR -->
  <div class="action-bar">
    ${
      hasFixChanges
        ? `
      <button class="btn btn-primary" onclick="applyFix()">Apply Fix</button>
      <button class="btn btn-secondary" onclick="previewFix()">Preview Diff</button>
      <button class="btn btn-secondary" onclick="openLocation()">Open in Editor</button>
    `
        : `
      <button class="btn btn-primary" onclick="openLocation()">Open in Editor</button>
    `
    }
    <button class="btn btn-secondary" onclick="suggestBetterDesign()">Suggest Better Design</button>
    <button class="btn btn-quiet" onclick="ignoreFinding()">Reject</button>
  </div>

  ${relatedSkillsBlock}

  <!-- 8. TECHNICAL DETAILS (Collapsible) -->
  <div class="details-toggle" onclick="toggleDetails()">
    <span>${this.showDetails ? 'Hide Details' : 'Details'}</span>
  </div>

  ${
    this.showDetails
      ? `
    <div class="details-box">
      ${f.ruleId ? `<div class="details-row"><span class="details-label">Rule ID:</span><span>${this.escapeHtml(f.ruleId)}</span></div>` : ''}
      <div class="details-row"><span class="details-label">Severity:</span><span>${this.escapeHtml(f.severity)}</span></div>
      ${
        f.confidence
          ? `<div class="details-row"><span class="details-label">Confidence:</span><span>${formatConfidencePercent(f.confidence)} (${formatConfidenceLabel(f.confidence)})${f.signals && f.signals.length > 0 ? ` — ${f.signals.length} corroborating signal(s)` : ''}</span></div>`
          : ''
      }
      ${f.route ? `<div class="details-row"><span class="details-label">Route:</span><span>${this.escapeHtml(f.route)}</span></div>` : ''}
      ${f.affectedComponents && f.affectedComponents.length > 0 ? `<div class="details-row"><span class="details-label">Components:</span><span>${this.escapeHtml(f.affectedComponents.join(', '))}</span></div>` : ''}
      ${f.detection ? `<div class="details-row"><span class="details-label">Detection:</span><span>${this.escapeHtml(f.detection)}</span></div>` : ''}
      ${loc?.filePath ? `<div class="details-row"><span class="details-label">File:</span><span>${this.escapeHtml(loc.filePath)}</span></div>` : ''}
      ${
        f.locations && f.locations.length > 1
          ? `<div class="details-row"><span class="details-label">Affected Files:</span><span>${this.escapeHtml(Array.from(new Set(f.locations.map(l => path.basename(l.filePath)))).join(', '))} (${f.locations.length} occurrences)</span></div>`
          : ''
      }
      ${
        f.falsePositiveNote
          ? `<div class="details-row"><span class="details-label">Context Note:</span><span>${this.escapeHtml(f.falsePositiveNote)}</span></div>`
          : ''
      }
    </div>
  `
      : ''
  }

  <script>
    const vscode = acquireVsCodeApi();

    function openLocation() {
      vscode.postMessage({ type: 'openLocation' });
    }

    function previousInstance() {
      vscode.postMessage({ type: 'previousInstance' });
    }

    function nextInstance() {
      vscode.postMessage({ type: 'nextInstance' });
    }

    function previewFix() {
      vscode.postMessage({ type: 'previewFix' });
    }

    function applyFix() {
      vscode.postMessage({ type: 'applyFix' });
    }

    function ignoreFinding() {
      vscode.postMessage({ type: 'ignoreFinding' });
    }

    function suggestBetterDesign() {
      vscode.postMessage({ type: 'suggestBetterDesign' });
    }

    function previewRecommendation(index) {
      vscode.postMessage({ type: 'previewRecommendation', index });
    }

    function applyRecommendation(index) {
      vscode.postMessage({ type: 'applyRecommendation', index });
    }

    function rejectRecommendation(index) {
      vscode.postMessage({ type: 'rejectRecommendation', index });
    }

    function applySpecificSuggestion(index, replacement) {
      vscode.postMessage({ type: 'applySpecificSuggestion', index, replacement });
    }

    function copySuggestionFixText(text) {
      vscode.postMessage({ type: 'copySuggestionFixText', text });
    }

    function toggleDetails() {
      vscode.postMessage({ type: 'toggleDetails' });
    }

    function installSkill(skillId) {
      vscode.postMessage({ type: 'installSkill', skillId });
    }

    function activateSkill(skillId) {
      vscode.postMessage({ type: 'activateSkill', skillId });
    }

    function toggleRelatedSkills() {
      vscode.postMessage({ type: 'toggleRelatedSkills' });
    }
  </script>
</body>
</html>`;
  }

  private renderEmptyState(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CraftLens</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 180px;
      text-align: center;
      padding: 24px;
    }
    .brand {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .message {
      font-size: 13px;
      color: var(--fg);
      max-width: 320px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="brand">CraftLens</div>
  <div class="message">Select an issue in the sidebar to see what is wrong and how to improve it.</div>
</body>
</html>`;
  }

  private renderRelatedSkillsBlock(relatedSkills: Skill[]): string {
    return [
      '<!-- RELATED SKILLS (Sections 28 & 29) -->',
      '<div class="related-skills-container">',
      '  <div class="related-skills-header">',
      '    <span class="related-skills-badge">RELATED SKILLS</span>',
      '    <span class="related-skills-sub">' + relatedSkills.length + ' recommended for this finding</span>',
      '  </div>',
      '  <div class="related-skills-list">',
      relatedSkills.map(sk => this.renderRelatedSkillRow(sk)).join(''),
      '  </div>',
      '  <button class="related-more-btn" onclick="toggleRelatedSkills()">',
      this.showAllRelatedSkills ? 'Show Less' : 'Show More',
      '  </button>',
      '</div>',
    ].join('\n');
  }

  private renderRelatedSkillRow(sk: Skill): string {
    const vLabel = sk.version ? 'v' + sk.version : 'Version unknown';
    let actionBtn = '';
    if (sk.active) {
      actionBtn = '<span class="btn-skill-action state-active">Active</span>';
    } else if (sk.installed) {
      actionBtn = '<button class="btn-skill-action state-activate" onclick="activateSkill(\'' + this.escapeHtml(sk.id) + '\')">Activate</button>';
    } else {
      actionBtn = '<button class="btn-skill-action state-install" onclick="installSkill(\'' + this.escapeHtml(sk.id) + '\')">Install</button>' +
        ' <button class="btn-skill-action state-activate" onclick="activateSkill(\'' + this.escapeHtml(sk.id) + '\')">Activate</button>';
    }

    const desc = (sk as any).reason || sk.description;

    return [
      '<div class="related-skill-row">',
      '  <div class="related-skill-info">',
      '    <div class="related-skill-title-line">',
      '      <span class="related-skill-name">' + this.escapeHtml(sk.name) + '</span>',
      '      <span class="related-skill-version">' + this.escapeHtml(vLabel) + '</span>',
      '      <span class="related-skill-source">' + this.escapeHtml(sk.source) + '</span>',
      '    </div>',
      '    <div class="related-skill-desc">' + this.escapeHtml(desc) + '</div>',
      '  </div>',
      '  <div class="related-skill-actions">',
      actionBtn,
      '  </div>',
      '</div>',
    ].join('\n');
  }

  private escapeHtml(text: string | null | undefined): string {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
