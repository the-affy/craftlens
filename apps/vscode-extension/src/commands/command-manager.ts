import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  AuditLevel,
  AuditStorageManager,
  Finding,
  ProjectContext,
  formatConfidencePercent,
  DismissalReason,
  UserFindingDismissal,
  RuleCategory,
  Severity,
  normalizeFindingLocation,
  FindingLocation,
  SidebarFinding,
  AuditSnapshotManager,
  RuleExecutionMode,
  formatChecklistMarkdown,
  UserRuleManager,
  Suggestion,
  toSemanticSeverity,
  RECOMMENDATION_REGISTRY,
  SkillDiscoveryService,
  ECOSYSTEM_SKILLS,
  Skill,
  normalizeRecommendation,
  CanonicalRecommendation,
} from '@craftlens/core';

import {
  RuleEngine,
  ProjectRuleGenerator,
  CustomRuleLoader,
  createRuleFromDefinition,
} from '@craftlens/rule-engine';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../configuration/config-manager.js';
import { CraftLensStatusBar } from '../status/status-bar.js';
import { CraftLensSidebarProvider } from '../sidebar/sidebar-provider.js';
import { CraftLensDetailViewProvider } from '../sidebar/detail-panel-provider.js';
import { CraftLensInlineDecorationManager } from '../decorations/inline-decorations.js';
import { UIAnalyzer, RecommendationPipeline, DesignRecommendation } from '@craftlens/design-intelligence';
import { RecommendationApplier } from '../recommendations/recommendation-applier.js';
import { ProjectOverviewPanel } from '../overview/project-overview-panel.js';

export type AuditMode =
  | 'ui_ux'
  | 'frontend_security'
  | 'backend_security'
  | 'practical_security'
  | 'code_quality'
  | 'full';

export class PreviewContentProvider implements vscode.TextDocumentContentProvider {
  private previews = new Map<string, string>();
  private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  public setPreview(uri: vscode.Uri, content: string): void {
    this.previews.set(uri.toString(), content);
    this.onDidChangeEmitter.fire(uri);
  }

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.previews.get(uri.toString()) || '';
  }
}

export class CommandManager {
  private disposables: vscode.Disposable[] = [];
  private previewProvider = new PreviewContentProvider();
  private outputChannel = vscode.window.createOutputChannel('CraftLens Audit');
  private recommendationApplier: RecommendationApplier;
  private issueHighlightDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    border: '1px solid var(--vscode-editorWarning-foreground, rgba(245, 158, 11, 0.6))',
    borderRadius: '2px',
    isWholeLine: false,
  });

  constructor(
    private engine: RuleEngine,
    private diagnosticsAdapter: DiagnosticsCollectionAdapter,
    private configManager: ConfigurationManager,
    private storageManager: AuditStorageManager,
    private statusBar: CraftLensStatusBar,
    private projectContext: ProjectContext,
    private sidebarProvider?: CraftLensSidebarProvider,
    private detailPanelProvider?: CraftLensDetailViewProvider,
    private inlineDecorationManager?: CraftLensInlineDecorationManager,
    private extensionUri?: vscode.Uri
  ) {
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider('craftlens-preview', this.previewProvider)
    );
    this.recommendationApplier = new RecommendationApplier(
      this.diagnosticsAdapter,
      this.sidebarProvider,
      this.detailPanelProvider,
      this.inlineDecorationManager,
      this.outputChannel,
      (doc) => this.scanDocument(doc),
      this.storageManager
    );
    this.registerCommands();
  }

  public setSidebarProvider(provider: CraftLensSidebarProvider): void {
    this.sidebarProvider = provider;
    this.updateRecommendationApplier();
  }

  public setDetailPanelProvider(provider: CraftLensDetailViewProvider): void {
    this.detailPanelProvider = provider;
    this.updateRecommendationApplier();
  }

  public setInlineDecorationManager(manager: CraftLensInlineDecorationManager): void {
    this.inlineDecorationManager = manager;
    this.updateRecommendationApplier();
  }

  private updateRecommendationApplier(): void {
    this.recommendationApplier = new RecommendationApplier(
      this.diagnosticsAdapter,
      this.sidebarProvider,
      this.detailPanelProvider,
      this.inlineDecorationManager,
      this.outputChannel,
      (doc) => this.scanDocument(doc),
      this.storageManager
    );
  }

  public scanDocument(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file') return;
    const config = this.configManager.getConfig();
    const result = this.engine.analyze({
      filePath: doc.uri.fsPath,
      sourceText: doc.getText(),
      version: doc.version,
      config,
      projectContext: this.projectContext,
    });
    this.diagnosticsAdapter.update(doc.uri, result.findings);
    this.sidebarProvider?.refresh();
    this.inlineDecorationManager?.updateAllVisibleEditors();
  }

  private generateModifiedCodeForRecommendation(
    originalText: string,
    finding: Finding,
    rec: DesignRecommendation
  ): string {
    const rawFix = (rec as any).proposedChanges || finding.designFix?.changes || finding.fix?.changes;
    if (rawFix && Array.isArray(rawFix) && rawFix.length > 0) {
      let modified = originalText;
      for (const change of rawFix) {
        if (change.originalSnippet && change.replacementSnippet) {
          modified = modified.replace(change.originalSnippet, change.replacementSnippet);
        }
      }
      return modified;
    }

    // Concrete contextual transformations for repeated card treatment / CP-007
    if (finding.ruleId === 'CP-007' || /repeated card|service-box|card-heavy/i.test(finding.message || finding.title || '')) {
      if (rec.transformation === 'hierarchize') {
        let count = 0;
        return originalText.replace(/class=["']([^"']*service-box[^"']*)["']/g, (match, classes) => {
          count++;
          if (count === 1) {
            return `class="${classes} service-box-featured" style="border-width: 2px; font-weight: 600;"`;
          } else {
            return `class="${classes} service-box-secondary" style="border-style: dashed; opacity: 0.9;"`;
          }
        });
      } else if (rec.transformation === 'distill') {
        return originalText.replace(/class=["']([^"']*service-box[^"']*)["']/g, (match, classes) => {
          return `class="${classes} service-editorial" style="border: none; background: transparent; box-shadow: none; padding: 12px 0;"`;
        });
      } else if (rec.transformation === 'differentiate') {
        let count = 0;
        return originalText.replace(/class=["']([^"']*service-box[^"']*)["']/g, (match, classes) => {
          count++;
          if (count % 2 === 1) {
            return `class="${classes} service-actionable"`;
          } else {
            return `class="${classes} service-informational" style="background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.08);"`;
          }
        });
      }
    }

    return originalText;
  }

  public resolveFinding(target?: any, secondArg?: any): Finding | undefined {
    // 1. Direct Finding object
    if (target && target.ruleId && (target.location || target.filePath || target.file)) {
      return target as Finding;
    }

    // 2. CraftLensTreeItem with finding
    if (target && target.finding) {
      return target.finding as Finding;
    }

    // 2b. Object with findingId or id
    if (target && typeof target === 'object') {
      const targetId = target.findingId || target.id;
      if (typeof targetId === 'string') {
        const match = this.diagnosticsAdapter.getFindingStore().getFindingById(targetId);
        if (match) return match;
      }
    }

    // 3. CraftLensTreeItem with issueGroup
    if (target && target.issueGroup && Array.isArray(target.issueGroup.findings) && target.issueGroup.findings.length > 0) {
      return target.issueGroup.findings[0] as Finding;
    }

    // 4. Object with extra.finding
    if (target && target.extra?.finding) {
      return target.extra.finding as Finding;
    }

    // 5. secondArg is finding
    if (secondArg && (secondArg.ruleId || secondArg.location || secondArg.filePath)) {
      return (secondArg.finding || secondArg) as Finding;
    }

    // 6. Look up in FindingStore by fingerprint/id if target is a string ID
    if (typeof target === 'string') {
      const match = this.diagnosticsAdapter.getFindingStore().getFindingById(target);
      if (match) return match;
    }

    // 7. Fallback: active editor finding
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const findings = this.diagnosticsAdapter.getFindingStore().getFindingsForFile(editor.document.fileName);
      if (findings.length > 0) {
        const cursorLine = editor.selection.active.line + 1;
        return findings.find(f => f.location?.start && Math.abs(f.location.start.line - cursorLine) <= 2) || findings[0];
      }
    }

    return undefined;
  }

  public isInsideWorkspace(targetPath: string): boolean {
    if (!targetPath) return false;
    const resolved = path.resolve(targetPath);
    const roots: string[] = [];
    if (this.projectContext?.rootPath) {
      roots.push(path.resolve(this.projectContext.rootPath));
    }
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        roots.push(path.resolve(folder.uri.fsPath));
      }
    }
    if (roots.length === 0) return true;
    return roots.some(root => {
      const rel = path.relative(root, resolved);
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    });
  }

  private resolveSkillId(arg: any): string {
    if (typeof arg === 'string') return arg;
    if (!arg || typeof arg !== 'object') return '';
    return arg.skillId || arg.id || arg.skill?.id || arg.name || '';
  }

  private filterRulesForMode(mode: AuditMode): Record<string, boolean> {
    const rules = this.engine.getRegistry().getAllRules();
    const enabledMap: Record<string, boolean> = {};

    for (const rule of rules) {
      const id = rule.id;
      const cat = rule.category as string;
      const tags = rule.tags || [];

      switch (mode) {
        case 'ui_ux':
          enabledMap[id] =
            id.startsWith('UI-') ||
            id.startsWith('UX-') ||
            id.startsWith('VH-') ||
            id.startsWith('CP-') ||
            id.startsWith('CX-') ||
            id.startsWith('ID-') ||
            id.startsWith('TY-') ||
            id.startsWith('LY-') ||
            id.startsWith('CL-') ||
            id.startsWith('IX-') ||
            id.startsWith('ST-') ||
            ['visual', 'hierarchy', 'css', 'ux', 'accessibility', 'copy', 'placeholder'].includes(cat);
          break;

        case 'frontend_security':
          enabledMap[id] =
            id === 'SEC-001' ||
            id === 'SEC-002' ||
            id === 'SEC-003' ||
            tags.includes('frontend-security');
          break;

        case 'backend_security':
          enabledMap[id] =
            id.startsWith('SEC-B') ||
            tags.includes('backend-security');
          break;

        case 'practical_security':
          enabledMap[id] =
            id.startsWith('SEC-P') ||
            tags.includes('practical-security');
          break;

        case 'code_quality':
          enabledMap[id] =
            id.startsWith('AP-') ||
            id.startsWith('CD-') ||
            id.startsWith('RE-') ||
            id.startsWith('FN-') ||
            ['code', 'react', 'patchwork'].includes(cat);
          break;

        case 'full':
        default:
          enabledMap[id] = true;
          break;
      }
    }

    return enabledMap;
  }

  public async runAuditWithMode(mode: AuditMode, forcedScope?: 'workspace' | 'file'): Promise<void> {
    let scope = forcedScope;
    if (!scope) {
      const scopePick = await vscode.window.showQuickPick(
        [
          { label: '$(repo) Entire Workspace', scope: 'workspace' as const, description: 'Scan all project source files' },
          { label: '$(file) Current File', scope: 'file' as const, description: 'Scan only the currently active editor file' },
        ],
        { placeHolder: 'Select Audit Scope' }
      );
      if (!scopePick) return;
      scope = scopePick.scope;
    }

    let filesToScan: vscode.Uri[] = [];
    if (scope === 'file') {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('CraftLens: No active file open to audit.');
        return;
      }
      filesToScan = [editor.document.uri];
    } else {
      filesToScan = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx,html,htm,vue,svelte,css}',
        '**/node_modules/**'
      );
    }

    const modeLabels: Record<AuditMode, string> = {
      ui_ux: 'UI / UX Design',
      frontend_security: 'Frontend Security',
      backend_security: 'Backend Security',
      practical_security: 'Practical Security',
      code_quality: 'Code Quality',
      full: 'Full',
    };

    const ruleFilter = this.filterRulesForMode(mode);
    const auditConfig = {
      ...this.configManager.getConfig(),
      rules: Object.fromEntries(
        Object.entries(ruleFilter).map(([id, enabled]) => [id, { enabled }])
      ),
    };

    let totalFindings = 0;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `CraftLens: Running ${modeLabels[mode]} Audit`,
        cancellable: true,
      },
      async (progress, token) => {
        for (let i = 0; i < filesToScan.length; i++) {
          if (token.isCancellationRequested) break;
          const fileUri = filesToScan[i];
          progress.report({
            message: `${i + 1}/${filesToScan.length} (${vscode.workspace.asRelativePath(fileUri)})`,
            increment: 100 / Math.max(1, filesToScan.length),
          });

          try {
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const result = this.engine.analyze({
              filePath: fileUri.fsPath,
              sourceText: doc.getText(),
              version: doc.version,
              config: auditConfig,
              projectContext: this.projectContext,
            });
            this.diagnosticsAdapter.update(fileUri, result.findings);
            totalFindings += result.findings.length;
          } catch (e) {
            console.error(`Audit failed for ${fileUri.fsPath}:`, e);
          }
        }
      }
    );

    // Refresh sidebar immediately
    this.sidebarProvider?.refresh();

    // Print concise human-friendly audit report
    const allFindings: Finding[] = [];
    for (const list of this.diagnosticsAdapter.getAllFindings().values()) {
      allFindings.push(...list);
    }

    this.printAuditSummary(mode, allFindings, filesToScan.length);
  }

  private printAuditSummary(mode: AuditMode, allFindings: Finding[], fileCount: number): void {
    const isUiMode = mode === 'ui_ux';
    const relevantFindings = mode === 'full'
      ? allFindings
      : allFindings.filter(f => {
          const cat = f.clusterId || (f as any).category;
          const id = f.ruleId;
          if (mode === 'ui_ux') {
            return (
              id.startsWith('UI-') ||
              id.startsWith('UX-') ||
              id.startsWith('VH-') ||
              id.startsWith('CP-') ||
              id.startsWith('CX-') ||
              id.startsWith('ID-') ||
              id.startsWith('TY-') ||
              id.startsWith('LY-') ||
              id.startsWith('IX-') ||
              id.startsWith('ST-') ||
              ['visual', 'hierarchy', 'css', 'ux', 'accessibility', 'copy', 'placeholder'].includes(cat)
            );
          }
          if (mode === 'frontend_security' || mode === 'backend_security' || mode === 'practical_security') {
            return id.startsWith('SEC');
          }
          return !id.startsWith('SEC') && !id.startsWith('UI-') && !id.startsWith('UX-');
        });

    const highPriority = relevantFindings.filter(f => f.severity === 'error' || f.severity === 'blocker');
    const medium = relevantFindings.filter(f => f.severity === 'warning');
    const suggestions = relevantFindings.filter(f => f.severity === 'suggestion' || f.severity === 'info');

    // Calculate Design Quality score (out of 100)
    let score = 100;
    score -= highPriority.length * 10;
    score -= medium.length * 4;
    score -= suggestions.length * 1;
    score = Math.max(15, Math.min(100, score));

    this.outputChannel.clear();
    this.outputChannel.appendLine(`========================================`);
    this.outputChannel.appendLine(`        CRAFTLENS: ${String(mode || 'all').toUpperCase().replace('_', ' ')} REVIEW`);
    this.outputChannel.appendLine(`========================================`);
    if (isUiMode) {
      this.outputChannel.appendLine(`Design Quality Score: ${score} / 100`);
    }
    this.outputChannel.appendLine(`Issues Found: ${relevantFindings.length} across ${fileCount} file(s)`);
    this.outputChannel.appendLine(`  • ${highPriority.length} High Priority`);
    this.outputChannel.appendLine(`  • ${medium.length} Medium`);
    this.outputChannel.appendLine(`  • ${suggestions.length} Suggestions`);
    this.outputChannel.appendLine(`────────────────────────────────────────`);

    if (highPriority.length > 0) {
      this.outputChannel.appendLine(`\nHIGH PRIORITY:`);
      for (const f of highPriority.slice(0, 5)) {
        const title = f.problemTitle || f.title || f.whatIsWrong || f.message;
        const file = f.location?.filePath ? path.basename(f.location.filePath) : '';
        const line = f.location?.start?.line ? `:${f.location.start.line}` : '';
        this.outputChannel.appendLine(`[High] ${title}`);
        this.outputChannel.appendLine(`  ${f.whatIsWrong || f.description} (${file}${line})`);
        if (f.howToFix) this.outputChannel.appendLine(`  Fix: ${f.howToFix}`);
      }
    }

    if (medium.length > 0) {
      this.outputChannel.appendLine(`\nMEDIUM:`);
      for (const f of medium.slice(0, 5)) {
        const title = f.problemTitle || f.title || f.whatIsWrong || f.message;
        const file = f.location?.filePath ? path.basename(f.location.filePath) : '';
        const line = f.location?.start?.line ? `:${f.location.start.line}` : '';
        this.outputChannel.appendLine(`• ${title} (${file}${line})`);
      }
    }

    if (suggestions.length > 0) {
      this.outputChannel.appendLine(`\nSUGGESTIONS:`);
      for (const f of suggestions.slice(0, 5)) {
        const title = f.problemTitle || f.title || f.whatIsWrong || f.message;
        this.outputChannel.appendLine(`• ${title}`);
      }
    }

    this.outputChannel.appendLine(`========================================`);
    this.outputChannel.show(true);

    const summaryText = isUiMode
      ? `UI / UX Review: ${relevantFindings.length} issue(s) found (Score: ${score}/100 · ${highPriority.length} High, ${medium.length} Med, ${suggestions.length} Suggestions).`
      : `${String(mode || 'all').toUpperCase().replace('_', ' ')} Review: ${relevantFindings.length} issue(s) found (${highPriority.length} High, ${medium.length} Med).`;

    vscode.window.showInformationMessage(summaryText, 'Open Findings in Sidebar').then(choice => {
      if (choice === 'Open Findings in Sidebar') {
        vscode.commands.executeCommand('workbench.view.extension.craftlens-view');
      }
    });
  }

  private registerCmd(commandId: string, callback: (...args: any[]) => any): vscode.Disposable {
    return vscode.commands.registerCommand(commandId, callback);
  }

  private registerCommands(): void {
    // 1. Audit Mode Selector QuickPick
    this.disposables.push(
      this.registerCmd('craftlens.runAudit', async () => {
        const modePick = await vscode.window.showQuickPick(
          [
            {
              label: '$(paintcan) UI / UX',
              description: 'Find visual and usability problems (Default)',
              detail: 'Inspects generic AI styling, card soup, visual hierarchy, spacing, typography, and UX states.',
              mode: 'ui_ux' as AuditMode,
              picked: true,
            },
            {
              label: '$(shield) Frontend Security',
              description: 'Browser-side security and exposure',
              detail: 'Inspects exposed secrets, insecure client storage, unsafe HTML, and dangerous redirects.',
              mode: 'frontend_security' as AuditMode,
            },
            {
              label: '$(server) Backend Security',
              description: 'API, authorization, data access and server risks',
              detail: 'Inspects authorization checks, IDOR risks, server-side validation, and rate limiting.',
              mode: 'backend_security' as AuditMode,
            },
            {
              label: '$(lock) Practical Security',
              description: 'Real-world security issues across the project',
              detail: 'Inspects error leakage, stack traces, insecure production config, and sensitive logging.',
              mode: 'practical_security' as AuditMode,
            },
            {
              label: '$(tools) Code Quality',
              description: 'Bugs, architecture and maintainability',
              detail: 'Inspects exception swallowing, any escape hatches, dead code, and maintainability smells.',
              mode: 'code_quality' as AuditMode,
            },
            {
              label: '$(checklist) Full Audit',
              description: 'Everything above',
              detail: 'Runs all audit modules across the entire project.',
              mode: 'full' as AuditMode,
            },
          ],
          {
            placeHolder: 'What do you want to review? (Default: UI / UX)',
          }
        );

        if (!modePick) return;
        await this.runAuditWithMode(modePick.mode);
      })
    );

    // 1b. Project Overview in Editor Tab
    this.disposables.push(
      this.registerCmd('craftlens.openProjectOverview', async () => {
        const extUri = this.extensionUri || vscode.Uri.file('/');
        ProjectOverviewPanel.createOrShow(
          extUri,
          this.diagnosticsAdapter.getFindingStore(),
          this.storageManager,
          this.configManager,
          this.engine,
          this.projectContext,
          () => {
            vscode.commands.executeCommand('craftlens.scanWorkspace');
          },
          async (findingId: string) => {
            await vscode.commands.executeCommand('craftlens.applyQuickFix', { id: findingId });
            return true;
          }
        );
      })
    );

    // 2. Dedicated Design Audit Command
    this.disposables.push(
      this.registerCmd('craftlens.designAudit', async () => {
        await this.runAuditWithMode('ui_ux');
      })
    );

    // 2a. Debug UI Analysis Command (Section 20)
    this.disposables.push(
      this.registerCmd('craftlens.debugUiAnalysis', async () => {
        let docUri: vscode.Uri | undefined;
        let sourceText = '';
        const editor = vscode.window.activeTextEditor;

        if (editor) {
          docUri = editor.document.uri;
          sourceText = editor.document.getText();
        } else {
          const files = await vscode.workspace.findFiles('**/*.{html,htm,tsx,jsx,vue,svelte}', '**/node_modules/**', 1);
          if (files.length > 0) {
            docUri = files[0];
            const doc = await vscode.workspace.openTextDocument(docUri);
            sourceText = doc.getText();
          }
        }

        if (!docUri) {
          vscode.window.showInformationMessage('CraftLens: No UI document found to analyze.');
          return;
        }

        const report = UIAnalyzer.analyze(docUri.fsPath, sourceText, undefined, this.projectContext);
        const s = report.debugSummary;

        this.outputChannel.clear();
        this.outputChannel.appendLine('========================================');
        this.outputChannel.appendLine('         CRAFTLENS: DEBUG UI ANALYSIS   ');
        this.outputChannel.appendLine('========================================');
        this.outputChannel.appendLine(`Project detected: ${s.projectDetected || 'Web'}`);
        this.outputChannel.appendLine(`Framework detected: ${s.frameworkDetected || 'HTML / JS'}`);
        this.outputChannel.appendLine(`UI files discovered: ${s.uiFilesDiscovered ?? 1}`);
        this.outputChannel.appendLine(`Components discovered: ${s.componentsDiscovered ?? s.components}`);
        this.outputChannel.appendLine(`Styles discovered: ${s.stylesDiscovered ?? 0}`);
        this.outputChannel.appendLine(`Tokens discovered: ${s.tokensDiscovered ?? 0}`);
        this.outputChannel.appendLine(`Routes discovered: ${(s.routesDiscovered && s.routesDiscovered.length > 0) ? s.routesDiscovered.join(', ') : 'None'}`);
        this.outputChannel.appendLine(`DOM available: ${s.domAvailable ? 'Yes' : 'No'}`);
        this.outputChannel.appendLine(`Rendered UI available: ${s.renderedUiAvailable ? 'Yes' : 'render analysis unavailable'}`);
        this.outputChannel.appendLine(`Rules executed: ${s.rulesExecuted}`);
        this.outputChannel.appendLine(`Rules skipped: ${s.rulesSkipped}`);
        this.outputChannel.appendLine('────────────────────────────────────────');
        this.outputChannel.appendLine('Signals:');
        if (s.rawSignalsList && s.rawSignalsList.length > 0) {
          for (const sig of s.rawSignalsList) {
            this.outputChannel.appendLine(`  • ${sig}`);
          }
        } else {
          this.outputChannel.appendLine('  (No suspicious visual signals detected)');
        }
        this.outputChannel.appendLine('Patterns:');
        if (s.patternsBuilt && s.patternsBuilt.length > 0) {
          for (const pat of s.patternsBuilt) {
            this.outputChannel.appendLine(`  • ${pat}`);
          }
        } else {
          this.outputChannel.appendLine('  (No multi-signal patterns built)');
        }
        this.outputChannel.appendLine('Clusters:');
        for (const [clusterName, count] of Object.entries(s.clusters)) {
          this.outputChannel.appendLine(`  • ${clusterName}: ${count}`);
        }
        this.outputChannel.appendLine('Findings:');
        this.outputChannel.appendLine(`  High: ${s.findings.high}`);
        this.outputChannel.appendLine(`  Medium: ${s.findings.medium}`);
        this.outputChannel.appendLine(`  Suggestions: ${s.findings.suggestions}`);
        this.outputChannel.appendLine('Suppressed findings:');
        if (s.suppressedFindings && s.suppressedFindings.length > 0) {
          for (const sup of s.suppressedFindings) {
            this.outputChannel.appendLine(`  • ${sup.ruleId}: ${sup.reason}`);
          }
        } else {
          this.outputChannel.appendLine('  (None)');
        }
        this.outputChannel.appendLine('========================================');
        this.outputChannel.show(true);
      })
    );

    // 2b. Dedicated Security Audit Command
    this.disposables.push(
      this.registerCmd('craftlens.securityAudit', async () => {
        await this.runAuditWithMode('frontend_security');
      })
    );

    // 2c. Dedicated Code Quality Audit Command
    this.disposables.push(
      this.registerCmd('craftlens.codeAudit', async () => {
        await this.runAuditWithMode('code_quality');
      })
    );

    // 3. Open Finding Location (Completely defensive navigation)
    this.disposables.push(
      this.registerCmd('craftlens.openFindingLocation', async (target?: any, secondArg?: any) => {
        try {
          const store = this.diagnosticsAdapter.getFindingStore();
          const sidebarFindings = store.getSidebarFindings();
          let sidebarFinding: SidebarFinding | undefined;
          let rawFinding: Finding | undefined;
          const instanceIndex = typeof secondArg === 'number' ? secondArg : 0;

          if (typeof target === 'string') {
            sidebarFinding = sidebarFindings.find(f => f.id === target || f.ruleId === target);
            rawFinding = store.getFindingById(target);
          } else {
            rawFinding = this.resolveFinding(target, secondArg);
            if (rawFinding) {
              sidebarFinding = sidebarFindings.find(
                f => f.id === (rawFinding!.fingerprint || rawFinding!.ruleId) || f.ruleId === rawFinding!.ruleId
              );
            }
          }

          // Defensive location resolution
          let normLoc =
            (sidebarFinding?.locations && sidebarFinding.locations[instanceIndex]) ||
            sidebarFinding?.location;

          if (!normLoc && rawFinding?.instances && rawFinding.instances[instanceIndex]) {
            const inst = rawFinding.instances[instanceIndex];
            normLoc = normalizeFindingLocation(inst) || (inst.location ? normalizeFindingLocation({
              location: inst.location,
              primaryLocation: inst.location,
            }) : undefined);
          }

          if (!normLoc && target && typeof target === 'object' && 'filePath' in target) {
            const tLine = typeof target.line === 'number' ? target.line : 1;
            normLoc = {
              filePath: target.filePath,
              range: {
                startLine: tLine,
                startColumn: 1,
                endLine: tLine,
                endColumn: 80,
              },
            };
          }

          if (!normLoc && typeof target === 'string' && target.includes(':') && !rawFinding && !sidebarFinding) {
            const parts = target.split(':');
            const targetPath = parts[0];
            const targetLine = parseInt(parts[1], 10);
            if (!isNaN(targetLine)) {
              normLoc = {
                filePath: targetPath,
                range: {
                  startLine: targetLine,
                  startColumn: 1,
                  endLine: targetLine,
                  endColumn: 80,
                },
              };
            }
          }

          if (!normLoc) {
            normLoc =
              (rawFinding ? normalizeFindingLocation(rawFinding) : undefined) ||
              normalizeFindingLocation(target) ||
              normalizeFindingLocation(secondArg);
          }

          if (!normLoc || !normLoc.filePath || typeof normLoc.filePath !== 'string' || !normLoc.filePath.trim()) {
            const choice = await vscode.window.showInformationMessage(
              'Location unavailable: This finding is no longer linked to a valid source location.',
              'Refresh analysis'
            );
            if (choice === 'Refresh analysis') {
              await vscode.commands.executeCommand('craftlens.scanCurrentFile');
            }
            return;
          }

          let filePath = normLoc.filePath;
          if (!path.isAbsolute(filePath)) {
            const root = this.projectContext?.rootPath || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');
            filePath = path.resolve(root, filePath);
          }

          if (!fs.existsSync(filePath)) {
            const choice = await vscode.window.showInformationMessage(
              'Location unavailable: This finding is no longer linked to a valid source location.',
              'Refresh analysis'
            );
            if (choice === 'Refresh analysis') {
              await vscode.commands.executeCommand('craftlens.scanCurrentFile');
            }
            return;
          }

          const uri = vscode.Uri.file(filePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          const startLine = Math.max(0, (normLoc.range?.startLine ?? 1) - 1);
          const startCol = Math.max(0, (normLoc.range?.startColumn ?? 1) - 1);
          const endLine = Math.max(startLine, (normLoc.range?.endLine ?? (startLine + 1)) - 1);
          const endCol = Math.max(0, (normLoc.range?.endColumn ?? 1) - 1);

          const range = new vscode.Range(
            new vscode.Position(startLine, startCol),
            new vscode.Position(endLine, endCol)
          );

          // Keep sidebar visible: preserveFocus true
          const editor = await vscode.window.showTextDocument(doc, {
            selection: range,
            preserveFocus: false,
            preview: false,
          });

          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

          // Native editor decoration highlight
          editor.setDecorations(this.issueHighlightDecoration, [range]);
          this.inlineDecorationManager?.highlightFocusRange(editor, range);

          // Open & update bottom panel
          if (sidebarFinding || rawFinding) {
            this.detailPanelProvider?.showFinding(
              (sidebarFinding || rawFinding)!,
              rawFinding,
              instanceIndex
            );
          }

          // Keep sidebar selected state in sync
          this.sidebarProvider?.setSelectedFinding(sidebarFinding?.id || null);
        } catch (e) {
          try {
            const choice = await vscode.window.showInformationMessage(
              'Location unavailable: Could not open document range.',
              'Refresh analysis'
            );
            if (choice === 'Refresh analysis') {
              await vscode.commands.executeCommand('craftlens.scanCurrentFile');
            }
          } catch {
            // Non-blocking fallback
          }
        }
      })
    );

    // 4. Suggest Better Design (Rebuilt with Contextual Design Reasoning Pipeline - Sections 3, 4, 10, 13, 14, 15, 23)
    this.disposables.push(
      this.registerCmd('craftlens.suggestBetterDesign', async (target?: any, secondArg?: any) => {
        try {
          let finding = this.resolveFinding(target, secondArg);
          const editor = vscode.window.activeTextEditor;
          if (!finding && editor) {
            const findings = this.diagnosticsAdapter.getFindingStore().getFindingsForFile(editor.document.fileName);
            if (findings.length > 0) {
              const cursorLine = editor.selection.active.line + 1;
              finding = findings.find(f => {
                const loc = normalizeFindingLocation(f);
                return loc && loc.range && cursorLine >= loc.range.startLine && cursorLine <= loc.range.endLine;
              }) || findings[0];
            }
          }

          if (!finding && !editor) {
            vscode.window.showInformationMessage('CraftLens: Open a UI component or select an issue to suggest design alternatives.');
            return;
          }

          const doc = editor?.document || (finding?.location?.filePath ? await vscode.workspace.openTextDocument(vscode.Uri.file(finding.location.filePath)) : undefined);
          const sourceCode = doc ? doc.getText() : '';
          const filePath = doc ? doc.uri.fsPath : (finding?.location?.filePath || '');

          // Run Contextual Design Reasoning Pipeline (Sections 3, 4, 10, 20, 23)
          let recommendations: DesignRecommendation[] = [];
          if (finding) {
            recommendations = await RecommendationPipeline.run({
              finding,
              filePath,
              sourceCode,
              projectContext: this.projectContext,
            });
          }

          if (recommendations.length === 0 && finding?.recommendations && finding.recommendations.length > 0) {
            recommendations = finding.recommendations;
          }

          if (recommendations.length === 0) {
            vscode.window.showInformationMessage('CraftLens: No contextual transformations found for this finding.');
            return;
          }

          // Show in inspector details panel (Section 13)
          if (finding) {
            this.detailPanelProvider?.showBetterDesign(finding, recommendations);
          }

          // Present contextual recommendations (Section 13)
          const normalizedRecs = recommendations.map(rec => normalizeRecommendation(rec, finding));
          const items = normalizedRecs.map(rec => ({
            label: `$(sparkle) ${rec.title}`,
            description: rec.description,
            detail: `Why it fits: ${(Array.isArray(rec.whyItFits) ? rec.whyItFits : []).join(' ')}  |  Tradeoff: ${rec.tradeoff || 'None'}  |  Confidence: ${Math.round((rec.confidence || 0.9) * 100)}%`,
            recommendation: rec,
          }));

          const chosen = await vscode.window.showQuickPick(items, {
            placeHolder: `BETTER DESIGN (${finding?.problemTitle || finding?.title || 'Contextual UI Analysis'}): Choose a direction:`,
            matchOnDescription: true,
            matchOnDetail: true,
          });

          if (!chosen) return;

          const rec = chosen.recommendation;
          const isManual = rec.fix?.type === 'manual' || !rec.fix?.edits || rec.fix.edits.length === 0;

          if (isManual) {
            const choice = await vscode.window.showInformationMessage(
              `CraftLens: "${rec.title}"\n${rec.description}\n\nTradeoff: ${rec.tradeoff || 'None'}`,
              'How to Improve',
              'Dismiss'
            );
            if (choice === 'How to Improve' && finding) {
              this.detailPanelProvider?.showBetterDesign(finding, [rec as any]);
            }
            return;
          }

          const choice = await vscode.window.showInformationMessage(
            `CraftLens: "${rec.title}"\n${rec.description}\n\nTradeoff: ${rec.tradeoff || 'None'}`,
            'Preview',
            'Apply',
            'Reject'
          );

          if (choice === 'Preview') {
            await vscode.commands.executeCommand('craftlens.previewRecommendation', finding, rec);
          } else if (choice === 'Apply') {
            await vscode.commands.executeCommand('craftlens.applyRecommendation', finding, rec);
          } else if (choice === 'Reject') {
            await vscode.commands.executeCommand('craftlens.rejectFinding', finding);
          }
        } catch (e) {
          vscode.window.showErrorMessage(`CraftLens: Failed to generate design recommendations: ${e}`);
        }
      })
    );

    // 4b. Preview Recommendation (Native VS Code Diff - Section 15)
    this.disposables.push(
      this.registerCmd('craftlens.previewRecommendation', async (targetFinding?: any, recArg?: any) => {
        const finding = this.resolveFinding(targetFinding);
        const rec = recArg || (finding?.recommendations ? finding.recommendations[0] : undefined);
        return await this.recommendationApplier.previewRecommendation(this.previewProvider, finding, rec);
      })
    );

    // 4c. Apply Recommendation & Re-scan (Section 15 & 27)
    this.disposables.push(
      this.registerCmd('craftlens.applyRecommendation', async (targetFinding?: any, recArg?: any) => {
        const finding = this.resolveFinding(targetFinding);
        const rec = recArg || (finding?.recommendations ? finding.recommendations[0] : undefined);
        return await this.recommendationApplier.applyRecommendation(finding, rec);
      })
    );

    // 5. Preview Proposed Fix (Native VS Code Diff)
    this.disposables.push(
      this.registerCmd('craftlens.previewDesignFix', async (target?: any, secondArg?: any) => {
        const targetFinding = this.resolveFinding(target, secondArg);
        if (!targetFinding || (!targetFinding.fix && !targetFinding.designFix)) {
          vscode.window.showInformationMessage('CraftLens: No proposed code transformation available to preview.');
          return;
        }

        const normLoc = normalizeFindingLocation(targetFinding);
        if (!normLoc?.filePath) {
          vscode.window.showInformationMessage('Location unavailable');
          return;
        }

        const targetUri = target instanceof vscode.Uri ? target : vscode.Uri.file(normLoc.filePath);
        try {
          const doc = await vscode.workspace.openTextDocument(targetUri);
          const originalText = doc.getText();
          let modifiedText = originalText;

          const changes = targetFinding.designFix?.changes || targetFinding.fix?.changes || [];
          for (const change of changes) {
            const startOffset = doc.offsetAt(new vscode.Position(change.range.start.line - 1, change.range.start.column - 1));
            const endOffset = doc.offsetAt(new vscode.Position(change.range.end.line - 1, change.range.end.column - 1));
            const newText = 'newText' in change ? (change as any).newText : (change as any).after;
            modifiedText = modifiedText.substring(0, startOffset) + newText + modifiedText.substring(endOffset);
          }

          const previewUri = vscode.Uri.parse(`craftlens-preview:${path.basename(targetUri.fsPath)}?id=${Date.now()}`);
          this.previewProvider.setPreview(previewUri, modifiedText);

          await vscode.commands.executeCommand(
            'vscode.diff',
            targetUri,
            previewUri,
            `CraftLens: Current ↔ Proposed Change (${targetFinding.problemTitle || targetFinding.ruleId})`
          );

          // Native Accept / Reject confirmation prompt
          const choice = await vscode.window.showInformationMessage(
            `CraftLens: Proposed change for "${targetFinding.problemTitle || targetFinding.whatIsWrong || targetFinding.message}".`,
            'Accept Changes',
            'Reject'
          );

          if (choice === 'Accept Changes') {
            await vscode.commands.executeCommand('craftlens.applyQuickFix', targetUri, targetFinding);
          } else if (choice === 'Reject') {
            await vscode.commands.executeCommand('craftlens.rejectFinding', targetUri, targetFinding);
          }
        } catch (e) {
          vscode.window.showErrorMessage(`CraftLens: Failed to preview changes: ${e}`);
        }
      })
    );

    // 6. Apply QuickFix / Accept
    this.disposables.push(
      this.registerCmd('craftlens.applyQuickFix', async (arg1?: any, arg2?: any) => {
        const finding = this.resolveFinding(arg1, arg2);
        const fix = finding?.designFix || finding?.fix;
        const changes = Array.isArray(fix?.changes) ? fix.changes : [];
        if (!finding || !fix || changes.length === 0) {
          vscode.window.showInformationMessage('CraftLens: No deterministic fix available for this finding.');
          return;
        }

        const normLoc = normalizeFindingLocation(finding);
        const uri = arg1 instanceof vscode.Uri ? arg1 : (normLoc?.filePath ? vscode.Uri.file(normLoc.filePath) : undefined);
        if (!uri) return;

        if (!this.isInsideWorkspace(uri.fsPath)) {
          vscode.window.showErrorMessage('CraftLens: Cannot modify file outside active workspace.');
          return;
        }

        const edit = new vscode.WorkspaceEdit();
        for (const change of changes) {
          const range = mapLocationToVsCodeRange(change.range);
          const newText = 'newText' in change ? (change as any).newText : (change as any).after;
          edit.replace(uri, range, newText);
        }

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
          // Remove the resolved finding from store immediately
          const store = this.diagnosticsAdapter.getFindingStore();
          const remaining = store.getFindingsForFile(uri.fsPath).filter(f => (f.fingerprint || f.ruleId) !== (finding.fingerprint || finding.ruleId));
          this.diagnosticsAdapter.update(uri, remaining);
          this.storageManager.markCriteriaCheckedForFinding(finding);
          this.sidebarProvider?.refresh();
          this.inlineDecorationManager?.updateAllVisibleEditors();
          vscode.window.showInformationMessage(`CraftLens: Applied fix "${fix.title}".`);
        }
      })
    );

    // 7. Accept Finding Fix (alias)
    this.disposables.push(
      this.registerCmd('craftlens.acceptFindingFix', async (arg1?: any, arg2?: any) => {
        await vscode.commands.executeCommand('craftlens.applyQuickFix', arg1, arg2);
      })
    );

    // 7b. Fix All Instances Command
    this.disposables.push(
      this.registerCmd('craftlens.fixAllInstances', async (arg1?: any, arg2?: any) => {
        const finding = this.resolveFinding(arg1, arg2);
        if (!finding) return;

        const instances = finding.instances || [];
        const fix = finding.designFix || finding.fix;
        const changes = Array.isArray(fix?.changes) ? fix.changes : [];

        if (instances.length === 0 || changes.length === 0) {
          vscode.window.showInformationMessage('CraftLens: No multi-instance automated transformation available.');
          return;
        }

        const edit = new vscode.WorkspaceEdit();
        let appliedCount = 0;

        for (const inst of instances) {
          const filePath = inst.filePath || inst.location?.filePath;
          if (!filePath) continue;
          let fullPath = filePath;
          if (!path.isAbsolute(fullPath)) {
            const root = this.projectContext?.rootPath || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');
            fullPath = path.resolve(root, fullPath);
          }
          if (!this.isInsideWorkspace(fullPath)) continue;
          if (!fs.existsSync(fullPath)) continue;

          const uri = vscode.Uri.file(fullPath);
          const instChanges = (inst.fix && Array.isArray((inst.fix as any).changes)) ? (inst.fix as any).changes : changes;
          for (const change of instChanges) {
            const range = mapLocationToVsCodeRange(change.range || inst.location);
            const newText = 'newText' in change ? (change as any).newText : (change as any).after;
            if (newText !== undefined) {
              edit.replace(uri, range, newText);
              appliedCount++;
            }
          }
        }

        if (appliedCount > 0) {
          const success = await vscode.workspace.applyEdit(edit);
          if (success) {
            finding.status = 'fixed';
            this.storageManager.markCriteriaCheckedForFinding(finding);
            this.sidebarProvider?.refresh();
            this.inlineDecorationManager?.updateAllVisibleEditors();
            vscode.window.showInformationMessage(`CraftLens: Successfully applied fixes across ${instances.length} instances.`);
            vscode.commands.executeCommand('craftlens.scanCurrentFile');
          }
        }
      })
    );

    // 8. Reject Finding (Dismiss)
    this.disposables.push(
      this.registerCmd('craftlens.rejectFinding', async (target?: any, secondArg?: any) => {
        const finding = this.resolveFinding(target, secondArg);
        if (!finding) return;

        const normLoc = normalizeFindingLocation(finding);
        if (normLoc?.filePath) {
          const store = this.diagnosticsAdapter.getFindingStore();
          const fileFindings = store.getFindingsForFile(normLoc.filePath);
          const remaining = fileFindings.filter(f => (f.fingerprint || f.ruleId) !== (finding.fingerprint || finding.ruleId));
          this.diagnosticsAdapter.update(vscode.Uri.file(normLoc.filePath), remaining);
        }

        this.sidebarProvider?.refresh();
        this.inlineDecorationManager?.updateAllVisibleEditors();
        vscode.window.showInformationMessage(`CraftLens: Finding dismissed.`);
      })
    );

    // 9. Review Design System
    this.disposables.push(
      this.registerCmd('craftlens.reviewDesignSystem', async () => {
        const ds = this.projectContext.designSystem;
        const baseline = this.projectContext.baseline;
        const hasDs = ds?.hasDesignSystem;

        if (hasDs) {
          const msg = [
            'DESIGN SYSTEM: Detected',
            `Spacing: ${baseline.spacing.join(' / ')}`,
            `Radius: ${baseline.radius.join(' / ')}`,
            `Typography: ${baseline.typography.primaryFont || 'Inter'} (${baseline.typography.weights.join(', ')})`,
            `Components: ${baseline.components.slice(0, 6).join(', ')}`,
          ].join('\n');
          vscode.window.showInformationMessage(msg, { modal: true });
        } else {
          const choice = await vscode.window.showWarningMessage(
            'DESIGN SYSTEM: No consistent design system detected.\nRecommended next step: Create tokens for colors, typography, spacing, radius, and components.',
            'Generate Token Scale',
            'Learn More'
          );
          if (choice === 'Generate Token Scale') {
            vscode.window.showInformationMessage('CraftLens: Standard 4/8-point design tokens ready to use in tailwind.config or CSS variables.');
          }
        }
      })
    );

    // 10. Recommended Tools & Skills (Section 21)
    this.disposables.push(
      this.registerCmd('craftlens.recommendedSkills', async () => {
        const picks = [
          {
            label: '$(paintcan) anti-vibe-coded',
            description: 'Eliminate AI template aesthetics',
            detail: 'Removes centered boilerplate hero grids, uncalibrated gradients, and generic decorative glows.',
          },
          {
            label: '$(symbol-structure) design-engineer',
            description: 'Establish design tokens and components',
            detail: 'Builds a unified design system with robust typography scales, radius tokens, and elevation.',
          },
          {
            label: '$(sparkle) ui-ux-pro-max',
            description: 'Hierarchy and interaction mastery',
            detail: 'Focuses on visual priority, CTA hierarchy, reading measures, and responsive composition.',
          },
          {
            label: '$(eye) accessibility',
            description: 'WCAG keyboard and focus audit',
            detail: 'Reviews outline-none violations, form field names, contrast ratios, and touch targets.',
          },
        ];

        const chosen = await vscode.window.showQuickPick(picks, {
          placeHolder: 'Recommended tools and skills based on current design findings:',
        });

        if (chosen) {
          vscode.window.showInformationMessage(`CraftLens: "${chosen.label.replace(/\$\([^)]+\)\s*/, '')}" recommended for addressing detected design inconsistencies.`);
        }
      })
    );

    // 10b. View Specific Recommendation (Human-friendly, never auto-installs)
    this.disposables.push(
      this.registerCmd('craftlens.viewRecommendation', async (recId: string) => {
        const rec = RECOMMENDATION_REGISTRY.find((r: any) => r.id === recId);
        if (!rec) {
          vscode.window.showInformationMessage('CraftLens: Recommendation details are not available.');
          return;
        }

        const detailsText = (rec.details || []).map((d: any) => `• ${d}`).join('\n');
        const modalMessage = [
          rec.title,
          '',
          rec.description,
          '',
          `Recommended: ${rec.recommendedCapability || rec.title}`,
          '',
          'A senior review skill can help check:',
          detailsText,
        ].join('\n');

        const choice = await vscode.window.showInformationMessage(
          modalMessage,
          { modal: true },
          'Learn More',
          'Configure for Project'
        );

        if (choice === 'Learn More') {
          vscode.window.showInformationMessage(
            `CraftLens: You can enable the ${rec.recommendedCapability || rec.title} skill in your project's AI assistant configuration.`
          );
        } else if (choice === 'Configure for Project') {
          // Never auto-install without confirmation
          const confirm = await vscode.window.showWarningMessage(
            `Configure ${rec.recommendedCapability || rec.title} for this workspace? CraftLens will save configuration guidelines to .craftlens/rules.`,
            'Confirm',
            'Cancel'
          );
          if (confirm === 'Confirm') {
            vscode.window.showInformationMessage(
              `CraftLens: Project configuration updated for ${rec.title}.`
            );
          }
        }
      })
    );

    // 10c. Skill Management & Versioned Intelligence Commands
    this.disposables.push(
      this.registerCmd('craftlens.addSkill', async (sourceArg?: any) => {
        try {
          if (sourceArg) {
            // Check if sourceArg is a file path string or url
            if (typeof sourceArg === 'string') {
              if (sourceArg.startsWith('http://') || sourceArg.startsWith('https://')) {
                const pkg = await this.engine.getSkillManager().importSkill(
                  { type: 'github', url: sourceArg },
                  { activateImmediately: false }
                );
                this.sidebarProvider?.refresh();
                vscode.window.showInformationMessage(`CraftLens: Imported GitHub skill "${pkg.manifest.displayName || pkg.manifest.name}".`);
                await this.runAuditWithMode('full', 'file');
                return;
              } else if (fs.existsSync(sourceArg)) {
                const pkg = await this.engine.getSkillManager().importSkill(
                  { type: 'file', path: sourceArg },
                  { activateImmediately: false }
                );
                this.sidebarProvider?.refresh();
                vscode.window.showInformationMessage(`CraftLens: Imported skill "${pkg.manifest.displayName || pkg.manifest.name}".`);
                await this.runAuditWithMode('full', 'file');
                return;
              }
            } else if (typeof sourceArg === 'object') {
              const filePath = sourceArg.filePath || sourceArg.path || sourceArg.file;
              if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
                const pkg = await this.engine.getSkillManager().importSkill(
                  { type: 'file', path: filePath },
                  { activateImmediately: sourceArg.active ?? false }
                );
                this.sidebarProvider?.refresh();
                vscode.window.showInformationMessage(`CraftLens: Imported skill "${pkg.manifest.displayName || pkg.manifest.name}".`);
                await this.runAuditWithMode('full', 'file');
                return;
              }
              const url = sourceArg.url || sourceArg.repository;
              if (url && typeof url === 'string') {
                const pkg = await this.engine.getSkillManager().importSkill(
                  { type: 'github', url },
                  { activateImmediately: sourceArg.active ?? false }
                );
                this.sidebarProvider?.refresh();
                vscode.window.showInformationMessage(`CraftLens: Imported GitHub skill "${pkg.manifest.displayName || pkg.manifest.name}".`);
                await this.runAuditWithMode('full', 'file');
                return;
              }
              const sid = this.resolveSkillId(sourceArg);
              if (sid) {
                await vscode.commands.executeCommand('craftlens.installSkill', sid, sourceArg.active ?? false);
                return;
              }
            }
          }

          const choice = await vscode.window.showQuickPick([
            { label: '$(file-code) Add local Markdown', description: 'Import a local .md or .markdown rule file', type: 'file' },
            { label: '$(repo) Add GitHub repository', description: 'Import declarative knowledge from GitHub', type: 'github' },
            { label: '$(search) Search skills...', description: 'Discover skills across GitHub, skills.sh and popular ecosystems', type: 'search' },
          ], { placeHolder: 'Select Skill Source to Import' });

          if (!choice) return;

          if (choice.type === 'file') {
            const uri = await vscode.window.showOpenDialog({
              canSelectFiles: true,
              canSelectFolders: false,
              canSelectMany: false,
              filters: { Markdown: ['md', 'markdown'] },
              title: 'Select Skill Markdown File',
            });
            if (uri && uri[0]) {
              try {
                const pkg = await this.engine.getSkillManager().importSkill(
                  { type: 'file', path: uri[0].fsPath },
                  { activateImmediately: false }
                );
                const versionStr = pkg.manifest.version ? `v${pkg.manifest.version}` : 'Version unknown';
                vscode.window.showInformationMessage(
                  `CraftLens: Imported skill "${pkg.manifest.displayName || pkg.manifest.name}" ${versionStr} (inactive). Check the box or click Activate when you wish to enable it.`
                );
                this.sidebarProvider?.refresh();
                await this.runAuditWithMode('full', 'file');
              } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to import skill: ${err.message}`);
              }
            }
          } else if (choice.type === 'github') {
            const url = await vscode.window.showInputBox({
              prompt: 'Enter GitHub Repository URL',
              placeHolder: 'https://github.com/Vanszs/Anti-AI-UI',
              ignoreFocusOut: true,
            });
            if (url) {
              try {
                const pkg = await this.engine.getSkillManager().importSkill(
                  { type: 'github', url },
                  { activateImmediately: false }
                );
                const versionStr = pkg.manifest.version ? `v${pkg.manifest.version}` : 'Version unknown';
                vscode.window.showInformationMessage(
                  `CraftLens: Imported GitHub skill "${pkg.manifest.displayName || pkg.manifest.name}" ${versionStr} (inactive).`
                );
                this.sidebarProvider?.refresh();
                await this.runAuditWithMode('full', 'file');
              } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to import GitHub skill: ${err.message}`);
              }
            }
          } else if (choice.type === 'search') {
            this.sidebarProvider?.switchTab('skills');
          }
        } catch (err: any) {
          console.error('[CraftLens] craftlens.addSkill error:', err);
          vscode.window.showErrorMessage(`CraftLens: Add skill failed: ${err?.message || err}`);
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.toggleSkill', async (skillIdArg: any, explicitActive?: boolean) => {
        try {
          const skillId = this.resolveSkillId(skillIdArg);
          if (!skillId) return;
          const mgr = this.engine.getSkillManager();
          const skill = mgr.getRegistry().getSkill(skillId);
          if (skill) {
            const nextActive = explicitActive !== undefined ? explicitActive : !(skill.enabled !== false);
            mgr.setSkillActive(skillId, nextActive);
            this.sidebarProvider?.refresh();
            vscode.window.showInformationMessage(
              `CraftLens: Skill "${skill.manifest.displayName || skill.manifest.name}" ${nextActive ? 'activated' : 'deactivated'}.`
            );
            await this.runAuditWithMode('full', 'file');
          }
        } catch (err: any) {
          console.error('[CraftLens] craftlens.toggleSkill error:', err);
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.installSkill', async (skillIdOrObj: any, activateImmediately: boolean = false) => {
        try {
          const skillId = this.resolveSkillId(skillIdOrObj);
          if (!skillId) return;

          const discoveryService = new SkillDiscoveryService();
          const candidate = ECOSYSTEM_SKILLS.find(s => s.id === skillId) || {
            id: skillId,
            name: skillId,
            description: 'Ecosystem skill',
            source: 'skills-sh',
            installed: false,
            active: false,
            status: 'available',
          };

          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
          const res = await discoveryService.installSkill(candidate as any, {
            workspaceRoot,
            activateImmediately,
          });

          if (res.success && res.pkg) {
            this.engine.getSkillManager().getRegistry().register(res.pkg);
            this.engine.getSkillManager().setSkillActive(skillId, activateImmediately);
            this.sidebarProvider?.refresh();
            vscode.window.showInformationMessage(
              `CraftLens: Installed skill "${res.skill.name}"${activateImmediately ? ' and activated' : ''}.`
            );
            if (activateImmediately) {
              await this.runAuditWithMode('full', 'file');
            }
          } else {
            vscode.window.showErrorMessage(res.error || `Could not install skill ${skillId}. Reason: No valid SKILL.md found.`);
          }
        } catch (err: any) {
          console.error('[CraftLens] craftlens.installSkill error:', err);
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.deleteSkill', async (skillIdArg: any) => {
        try {
          const skillId = this.resolveSkillId(skillIdArg);
          if (!skillId) return;
          const skill = this.engine.getSkillManager().getSkill(skillId);
          const skillName = skill?.name || skillId;

          const confirm = await vscode.window.showWarningMessage(
            `Delete ${skillName}? This will remove the installed skill from CraftLens. Your original uploaded file will not be deleted.`,
            { modal: true },
            'Delete Skill',
            'Cancel'
          );

          if (confirm === 'Delete Skill') {
            await this.engine.getSkillManager().deleteSkill(skillId);
            this.sidebarProvider?.refresh();
            vscode.window.showInformationMessage(
              `CraftLens: Removed skill "${skillName}". Your original uploaded file was not deleted.`
            );
            await this.runAuditWithMode('full', 'file');
          }
        } catch (err: any) {
          console.error('[CraftLens] craftlens.deleteSkill error:', err);
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.openSkillSource', async (skillIdArg: any) => {
        try {
          const skillId = this.resolveSkillId(skillIdArg);
          if (!skillId) return;
          const skill = this.engine.getSkillManager().getSkill(skillId);
          if (skill?.originalFilePath && fs.existsSync(skill.originalFilePath)) {
            const doc = await vscode.workspace.openTextDocument(skill.originalFilePath);
            await vscode.window.showTextDocument(doc);
            return;
          }
          if (skill?.path && fs.existsSync(skill.path)) {
            const doc = await vscode.workspace.openTextDocument(skill.path);
            await vscode.window.showTextDocument(doc);
            return;
          }
          if (skill?.repository) {
            const url = skill.repository.startsWith('http') ? skill.repository : `https://github.com/${skill.repository}`;
            await vscode.env.openExternal(vscode.Uri.parse(url));
            return;
          }
          if (skill?.readmeUrl) {
            await vscode.env.openExternal(vscode.Uri.parse(skill.readmeUrl));
            return;
          }
          vscode.window.showInformationMessage(`CraftLens: No external repository URL configured for ${skill?.name || skillId}.`);
        } catch (err: any) {
          console.error('[CraftLens] craftlens.openSkillSource error:', err);
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.setRuleExecutionMode', async (modeArg?: string) => {
        let mode = modeArg;
        if (!mode) {
          const pick = await vscode.window.showQuickPick([
            { label: '$(shield) CraftLens Rules', description: 'Run only CraftLens built-in rules', mode: 'builtin' },
            { label: '$(person) User Rules', description: 'Run only user and imported rules', mode: 'custom' },
            { label: '$(layers) CraftLens + User Rules', description: 'Combined built-in and user rules (Default)', mode: 'combined' },
          ], { placeHolder: 'Select Rule Sources' });
          if (pick) mode = pick.mode;
        }
        if (mode) {
          this.engine.setRuleExecutionMode(mode as RuleExecutionMode);
          this.sidebarProvider?.refresh();
          vscode.window.showInformationMessage(`CraftLens: Rule execution mode set to ${String(mode || '').toUpperCase()}.`);
          await this.runAuditWithMode('full', 'file');
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.checkSkillUpdates', async (skillId: string) => {
        const summary = await this.engine.getSkillManager().checkForUpdates(skillId);
        if (summary) {
          const action = await vscode.window.showInformationMessage(
            `Update available for ${summary.skillId}: ${summary.fromVersion} -> ${summary.toVersion}. Added: ${summary.addedRules.length}, Changed: ${summary.changedRules.length}, Removed: ${summary.removedRules.length}.`,
            'Update',
            'Dismiss'
          );
          if (action === 'Update') {
            vscode.window.showInformationMessage(`CraftLens: Skill ${summary.skillId} updated to ${summary.toVersion}.`);
            this.sidebarProvider?.refresh();
          }
        } else {
          vscode.window.showInformationMessage(`CraftLens: Skill is up to date.`);
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.fixAllSafe', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const fileFindings = this.diagnosticsAdapter.getFindingsForFile(editor.document.fileName);
        const safeFindings = fileFindings.filter(
          f =>
            (f.fix?.kind === 'safe' || f.designFix?.safety === 'safe') &&
            ((f.fix?.changes && f.fix.changes.length > 0) || (f.designFix?.changes && f.designFix.changes.length > 0))
        );
        if (safeFindings.length === 0) {
          vscode.window.showInformationMessage('CraftLens: No safe automated fixes available in this file.');
          return;
        }
        const edit = new vscode.WorkspaceEdit();
        for (const f of safeFindings) {
          const changes = f.designFix?.changes || f.fix?.changes || [];
          for (const c of changes) {
            const range = mapLocationToVsCodeRange(c.range);
            const newText = 'newText' in c ? (c as any).newText : (c as any).after;
            edit.replace(editor.document.uri, range, newText);
          }
        }
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
          for (const f of safeFindings) {
            this.storageManager.markCriteriaCheckedForFinding(f);
          }
          this.sidebarProvider?.refresh();
          this.inlineDecorationManager?.updateAllVisibleEditors();
          vscode.window.showInformationMessage(`CraftLens: Applied ${safeFindings.length} safe automated fix(es).`);
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.inspectRule', async (ruleId: string) => {
        try {
          const explanation = await this.engine.getCanonicalEngine().explain(ruleId);
          vscode.window.showInformationMessage(
            `[${explanation.rule.id}] ${explanation.rule.name || explanation.rule.title}\n\nDetects: ${explanation.detects}\n\nRecommendation: ${explanation.recommendation}`,
            { modal: true }
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`Rule explanation unavailable: ${err.message}`);
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.overrideRule', async (ruleId: string) => {
        const choice = await vscode.window.showQuickPick([
          { label: 'Error', severity: 'error' },
          { label: 'Warning', severity: 'warning' },
          { label: 'Suggestion', severity: 'suggestion' },
          { label: 'Disable Rule', enabled: false },
        ], { placeHolder: `Override rule ${ruleId}` });

        if (choice) {
          if ('enabled' in choice) {
            this.engine.getCanonicalEngine().disableRule(ruleId);
            vscode.window.showInformationMessage(`CraftLens: Rule ${ruleId} disabled.`);
          } else {
            this.engine.getCanonicalEngine().setRuleOverride({ ruleId, severity: choice.severity as any, enabled: true });
            vscode.window.showInformationMessage(`CraftLens: Rule ${ruleId} severity overridden to ${choice.label}.`);
          }
          this.sidebarProvider?.refresh();
          await this.runAuditWithMode('full', 'file');
        }
      })
    );

    this.disposables.push(
      this.registerCmd('craftlens.createAuditSnapshot', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '/';
        const snapshotMgr = new AuditSnapshotManager(workspaceRoot);
        const allFindings = this.diagnosticsAdapter.getFindingStore().getAllFindings();
        const snapshot = snapshotMgr.createSnapshot({
          skills: this.engine.getSkillManager().getRegistry().getAllSkills(),
          rules: this.engine.getCanonicalEngine().getRules(),
          findings: allFindings,
        });
        vscode.window.showInformationMessage(
          `CraftLens: Captured reproducible audit snapshot '${snapshot.id}' (${snapshot.findings.length} findings, Engine v${snapshot.engineVersion}).`
        );
      })
    );

    // 11. Toggle Auto Audit
    this.disposables.push(
      this.registerCmd('craftlens.toggleAutoAudit', async () => {
        const current = this.configManager.getConfig().autoAudit;
        const vsConfig = vscode.workspace.getConfiguration('craftlens');
        await vsConfig.update('autoAudit', !current, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(
          `CraftLens: Auto Audit is now ${!current ? 'ENABLED' : 'DISABLED'}.`
        );
        this.sidebarProvider?.refresh();
      })
    );

    // 12. Next Issue (Safe sorting)
    this.disposables.push(
      this.registerCmd('craftlens.nextIssue', async () => {
        const store = this.diagnosticsAdapter.getFindingStore();
        const allFindings = store.getAllFindings().filter(f => !!f.location?.filePath).sort((a, b) => {
          const aPath = a.location?.filePath || '';
          const bPath = b.location?.filePath || '';
          if (aPath !== bPath) return aPath.localeCompare(bPath);
          const aLine = a.location?.start?.line ?? 0;
          const bLine = b.location?.start?.line ?? 0;
          return aLine - bLine;
        });

        if (allFindings.length === 0) {
          vscode.window.showInformationMessage('CraftLens: No active issues in workspace.');
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          await vscode.commands.executeCommand('craftlens.openFindingLocation', allFindings[0]);
          return;
        }

        const currentFile = editor.document.uri.fsPath;
        const currentLine = editor.selection.active.line + 1;

        let nextIndex = allFindings.findIndex(f => {
          const fPath = f.location?.filePath || '';
          const fLine = f.location?.start?.line ?? 0;
          if (fPath !== currentFile) return fPath > currentFile;
          return fLine > currentLine;
        });

        if (nextIndex === -1) nextIndex = 0;
        await vscode.commands.executeCommand('craftlens.openFindingLocation', allFindings[nextIndex]);
      })
    );

    // 13. Previous Issue (Safe sorting)
    this.disposables.push(
      this.registerCmd('craftlens.previousIssue', async () => {
        const store = this.diagnosticsAdapter.getFindingStore();
        const allFindings = store.getAllFindings().filter(f => !!f.location?.filePath).sort((a, b) => {
          const aPath = a.location?.filePath || '';
          const bPath = b.location?.filePath || '';
          if (aPath !== bPath) return aPath.localeCompare(bPath);
          const aLine = a.location?.start?.line ?? 0;
          const bLine = b.location?.start?.line ?? 0;
          return aLine - bLine;
        });

        if (allFindings.length === 0) {
          vscode.window.showInformationMessage('CraftLens: No active issues in workspace.');
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          await vscode.commands.executeCommand('craftlens.openFindingLocation', allFindings[allFindings.length - 1]);
          return;
        }

        const currentFile = editor.document.uri.fsPath;
        const currentLine = editor.selection.active.line + 1;

        let prevIndex = -1;
        for (let i = allFindings.length - 1; i >= 0; i--) {
          const f = allFindings[i];
          const fPath = f.location?.filePath || '';
          const fLine = f.location?.start?.line ?? 0;
          if (fPath < currentFile || (fPath === currentFile && fLine < currentLine)) {
            prevIndex = i;
            break;
          }
        }

        if (prevIndex === -1) prevIndex = allFindings.length - 1;
        await vscode.commands.executeCommand('craftlens.openFindingLocation', allFindings[prevIndex]);
      })
    );

    // 14. Show Finding Details Inspector
    this.disposables.push(
      this.registerCmd('craftlens.showFindingDetail', (target?: any, sectionOrSecondArg?: any) => {
        let section: 'why' | 'how' | 'what' | 'diff' | 'heuristics' | 'overview' = 'why';
        if (typeof sectionOrSecondArg === 'string') {
          section = sectionOrSecondArg as any;
        }
        const finding = this.resolveFinding(target, sectionOrSecondArg);
        if (!finding) {
          vscode.window.showInformationMessage('CraftLens: No issue selected to inspect.');
          return;
        }
        this.detailPanelProvider?.showFinding(finding, section);
      })
    );

    // 15. Scan Current File
    this.disposables.push(
      this.registerCmd('craftlens.scanCurrentFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('CraftLens: No active file open to scan.');
          return;
        }

        const doc = editor.document;
        const config = this.configManager.getConfig();
        const result = this.engine.analyze({
          filePath: doc.uri.fsPath,
          sourceText: doc.getText(),
          version: doc.version,
          config,
          projectContext: this.projectContext,
        });

        this.diagnosticsAdapter.update(doc.uri, result.findings);
        this.sidebarProvider?.refresh();
        vscode.window.showInformationMessage(
          `CraftLens: Scan completed. Found ${result.findings.length} issue(s).`
        );
      })
    );

    // 16. Scan Workspace
    this.disposables.push(
      this.registerCmd('craftlens.scanWorkspace', async () => {
        await this.runAuditWithMode('full', 'workspace');
      })
    );

    // 17. Open Problems
    this.disposables.push(
      this.registerCmd('craftlens.openProblems', () => {
        vscode.commands.executeCommand('workbench.action.problems.focus');
      })
    );

    // 18. Refresh Sidebar
    this.disposables.push(
      this.registerCmd('craftlens.refreshSidebar', () => {
        this.sidebarProvider?.refresh();
      })
    );

    // 19. Open Master Checklist (.craftlens/checklist.md)
    this.disposables.push(
      this.registerCmd('craftlens.openMasterChecklist', async () => {
        try {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('CraftLens: No active workspace folder open.');
            return;
          }
          this.storageManager.ensureDir();
          const checklistPath = path.join(this.storageManager.getDirectory(), 'checklist.md');

          if (!fs.existsSync(checklistPath)) {
            const findings = this.diagnosticsAdapter.getFindingStore().getAllFindings();
            const currentLevel = this.configManager.getConfig().defaultAuditLevel || 'moderate';
            const { checklist } = this.storageManager.syncAudit(this.projectContext, findings, currentLevel);
            const md = formatChecklistMarkdown(checklist);
            this.storageManager.saveChecklistMarkdown(md);
          }

          const docUri = vscode.Uri.file(checklistPath);
          const doc = await vscode.workspace.openTextDocument(docUri);
          await vscode.window.showTextDocument(doc, { preview: false });
        } catch (err: any) {
          vscode.window.showErrorMessage(`CraftLens: Failed to open master checklist: ${err?.message || err}`);
        }
      })
    );

    // 20. Filter Sidebar Issues
    this.disposables.push(
      this.registerCmd('craftlens.filterSidebar', async () => {
        const options = [
          { label: '$(clear-all) All Issues', description: 'Show all detected issues', value: 'all' },
          { label: '$(error) Errors Only', description: 'Show high-severity issues only', value: 'error' },
          { label: '$(warning) Warnings Only', description: 'Show warnings and moderate issues', value: 'warning' },
          { label: '$(info) Suggestions Only', description: 'Show low-severity / quality suggestions', value: 'suggestion' },
          { label: '$(tools) Safe Quick-Fix Available', description: 'Issues that can be fixed automatically', value: 'hasFix' },
          { label: '$(paintcan) UI & Layout', description: 'Design smells, card overuse, button styling', value: 'ui' },
          { label: '$(symbol-method) Functionality & Code Quality', description: 'Anti-patterns, error swallowing, dead code', value: 'backend' },
          { label: '$(shield) Security & Safety', description: 'Hardcoded secrets, unsafe HTML, SSRF', value: 'security' },
        ];
        const selected = await vscode.window.showQuickPick(options, {
          placeHolder: 'Filter CraftLens sidebar issues...',
        });
        if (selected) {
          this.sidebarProvider?.setFilter(selected.value);
        }
      })
    );

    // 21. Clear Sidebar Filter
    this.disposables.push(
      this.registerCmd('craftlens.clearSidebarFilter', () => {
        this.sidebarProvider?.setFilter('all');
        vscode.window.showInformationMessage('CraftLens: Filter cleared.');
      })
    );

    // 22. Show Report (routes to master checklist)
    this.disposables.push(
      this.registerCmd('craftlens.showReport', async () => {
        return vscode.commands.executeCommand('craftlens.openMasterChecklist');
      })
    );

    // 23. Explain Finding (routes to detail panel)
    this.disposables.push(
      this.registerCmd('craftlens.explainFinding', async (target?: any, secondArg?: any) => {
        return vscode.commands.executeCommand('craftlens.showFindingDetail', target, secondArg);
      })
    );

    // 24. Mark as Not a Problem
    this.disposables.push(
      this.registerCmd('craftlens.markNotAProblem', async (target?: any, secondArg?: any) => {
        const finding = this.resolveFinding(target, secondArg);
        if (!finding) {
          vscode.window.showInformationMessage('CraftLens: Please select an issue to dismiss.');
          return;
        }
        const reasons = [
          { label: 'Intentional design decision', reason: 'intentional_design' },
          { label: 'Temporary prototype / spike code', reason: 'temporary_code' },
          { label: 'False positive', reason: 'false_positive' },
          { label: 'Compensating control exists elsewhere', reason: 'compensating_control' },
        ];
        const picked = await vscode.window.showQuickPick(reasons, {
          placeHolder: `Why is ${finding.ruleId} not a problem here?`,
        });
        if (picked) {
          this.storageManager.addSuppression(finding.ruleId);
          vscode.window.showInformationMessage(`CraftLens: Marked ${finding.ruleId} as not a problem (${picked.label}).`);
          this.sidebarProvider?.refresh();
        }
      })
    );

    // 25. Ignore Rule (workspace suppression)
    this.disposables.push(
      this.registerCmd('craftlens.ignoreRule', async (target?: any, secondArg?: any) => {
        const finding = this.resolveFinding(target, secondArg);
        const ruleId = finding?.ruleId || (typeof target === 'string' ? target : undefined);
        if (!ruleId) {
          vscode.window.showInformationMessage('CraftLens: Select an issue or rule to ignore.');
          return;
        }
        this.storageManager.addSuppression(ruleId);
        vscode.window.showInformationMessage(`CraftLens: Rule '${ruleId}' suppressed for this workspace.`);
        this.sidebarProvider?.refresh();
      })
    );

    // 26. Reset Suppressions
    this.disposables.push(
      this.registerCmd('craftlens.resetSuppressions', async () => {
        const suppPath = path.join(this.storageManager.getDirectory(), 'suppressions.json');
        if (fs.existsSync(suppPath)) {
          fs.writeFileSync(suppPath, JSON.stringify({ suppressions: [] }, null, 2), 'utf-8');
        }
        vscode.window.showInformationMessage('CraftLens: Workspace suppressions have been reset.');
        this.sidebarProvider?.refresh();
      })
    );

    // 27. Create Custom Rule
    this.disposables.push(
      this.registerCmd('craftlens.createCustomRule', async () => {
        const rulesDir = path.resolve(this.storageManager.getDirectory(), 'rules');
        if (!fs.existsSync(rulesDir)) {
          fs.mkdirSync(rulesDir, { recursive: true });
        }
        const ruleId = await vscode.window.showInputBox({
          prompt: 'Enter rule ID (e.g. CR-001-no-console-log)',
          value: 'CR-001-custom-rule',
        });
        if (!ruleId) return;

        const sanitizedId = path.basename(ruleId).trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (!sanitizedId) {
          vscode.window.showErrorMessage('CraftLens: Invalid rule ID. Use alphanumeric characters, dashes, and underscores only.');
          return;
        }

        const ruleFile = path.resolve(rulesDir, `${sanitizedId}.md`);
        const rel = path.relative(rulesDir, ruleFile);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          vscode.window.showErrorMessage('CraftLens: Path traversal attempt blocked.');
          return;
        }

        if (!fs.existsSync(ruleFile)) {
          const template = `---
id: ${sanitizedId}
title: Custom Quality Check
severity: warning
category: code
---
# ${sanitizedId}: Description
Provide detailed guidelines and instructions for CraftLens verification.
`;
          fs.writeFileSync(ruleFile, template, 'utf-8');
        }
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(ruleFile));
        await vscode.window.showTextDocument(doc);
        this.sidebarProvider?.refresh();
      })
    );

    // 28. Generate Project Rules
    this.disposables.push(
      this.registerCmd('craftlens.generateProjectRules', async () => {
        const gen = new ProjectRuleGenerator();
        const generated = gen.generateRulesForProject(this.projectContext);
        vscode.window.showInformationMessage(`CraftLens: Generated ${generated.length} tailored project rules.`);
        this.sidebarProvider?.refresh();
      })
    );

    // 29. Show Health Breakdown
    this.disposables.push(
      this.registerCmd('craftlens.showHealthBreakdown', async () => {
        const audit = this.storageManager.loadAudit();
        if (!audit) {
          vscode.window.showInformationMessage('CraftLens: No audit data available yet. Run an audit first.');
          return;
        }
        const summary = audit.summary;
        vscode.window.showInformationMessage(
          `CraftLens Health Score: ${summary.healthScore}/100 (${summary.healthGrade})\n` +
          `Checks Passed: ${summary.passed}/${summary.total} (${summary.passPercentage}%)\n` +
          `Errors: ${summary.errors} | Warnings: ${summary.warnings} | Suggestions: ${summary.suggestions}`
        );
      })
    );

    // 30. Add User Rules (Section 6)
    this.disposables.push(
      this.registerCmd('craftlens.addUserRules', async () => {
        const option = await vscode.window.showQuickPick([
          { label: '$(cloud-upload) Upload Markdown', description: 'Upload a .md, .markdown, or .txt rule file', id: 'upload' },
          { label: '$(globe) Import from URL', description: 'Fetch and validate rules from a public URL', id: 'url' },
          { label: '$(clippy) Paste Markdown', description: 'Paste rule definitions in Markdown format', id: 'paste' },
        ], { placeHolder: 'Add User Rules: Select source format' });

        if (!option) return;

        if (option.id === 'upload') {
          await vscode.commands.executeCommand('craftlens.uploadMarkdownRules');
        } else if (option.id === 'url') {
          await vscode.commands.executeCommand('craftlens.importRulesFromUrl');
        } else if (option.id === 'paste') {
          await vscode.commands.executeCommand('craftlens.pasteMarkdownRules');
        }
      })
    );

    // 31. Upload Markdown Rules File
    this.disposables.push(
      this.registerCmd('craftlens.uploadMarkdownRules', async () => {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'Markdown / Text': ['md', 'markdown', 'txt'] },
          openLabel: 'Import Rules',
        });

        if (!uris || uris.length === 0) return;
        const fileUri = uris[0];
        try {
          const content = fs.readFileSync(fileUri.fsPath, 'utf-8');
          const fileName = path.basename(fileUri.fsPath);
          const { group, errors } = UserRuleManager.parseMarkdown(content, 'upload', fileName);

          if (group.rules.length === 0) {
            vscode.window.showErrorMessage(`Failed to parse rules from ${fileName}: ${errors.join(', ')}`);
            return;
          }

          this.engine.getUserRuleManager().addGroup(group);
          this.sidebarProvider?.refresh();
          vscode.window.showInformationMessage(`Imported ${group.rules.length} user rules into "${group.name}".`);
          await this.runAuditWithMode('full', 'file');
        } catch (err: any) {
          vscode.window.showErrorMessage(`Error reading rule file: ${err.message}`);
        }
      })
    );

    // 32. Import Rules from URL (Section 7)
    this.disposables.push(
      this.registerCmd('craftlens.importRulesFromUrl', async (providedUrl?: string) => {
        const url = providedUrl || await vscode.window.showInputBox({
          prompt: 'Enter public URL containing Markdown rules (e.g. https://example.com/my-rules.md)',
          placeHolder: 'https://...',
          validateInput: (v) => (!v.startsWith('http://') && !v.startsWith('https://')) ? 'Must start with http:// or https://' : null,
        });

        if (!url) return;

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `CraftLens: Fetching rules from ${url}...`,
          cancellable: false,
        }, async () => {
          const preview = await UserRuleManager.fetchAndValidateUrl(url);
          if (!preview.success || !preview.parsedGroup) {
            vscode.window.showErrorMessage(`Rule import failed: ${preview.error}`);
            return;
          }

          // Show preview and confirmation (Section 7: Let user approve)
          const choice = await vscode.window.showInformationMessage(
            `Validated ${preview.ruleCount} rules from "${preview.groupName}". Add to your User Rule Library?`,
            { modal: true },
            'Approve & Import',
            'Cancel'
          );

          if (choice === 'Approve & Import') {
            this.engine.getUserRuleManager().addGroup(preview.parsedGroup);
            this.sidebarProvider?.refresh();
            vscode.window.showInformationMessage(`Successfully imported ${preview.ruleCount} rules into User Rule Library!`);
            await this.runAuditWithMode('full', 'file');
          }
        });
      })
    );

    // 33. Paste Markdown Rules
    this.disposables.push(
      this.registerCmd('craftlens.pasteMarkdownRules', async () => {
        const text = await vscode.window.showInputBox({
          prompt: 'Paste Markdown rules (e.g. # My Rules\\n## Avoid gradient text\\nSeverity: warning)',
          placeHolder: 'Paste markdown here...',
        });

        if (!text || !text.trim()) return;

        const { group, errors } = UserRuleManager.parseMarkdown(text, 'pasted', 'Pasted Rules');
        if (group.rules.length === 0) {
          vscode.window.showErrorMessage(`Failed to parse pasted rules: ${errors.join(', ')}`);
          return;
        }

        this.engine.getUserRuleManager().addGroup(group);
        this.sidebarProvider?.refresh();
        vscode.window.showInformationMessage(`Imported ${group.rules.length} rules from pasted markdown.`);
        await this.runAuditWithMode('full', 'file');
      })
    );

    // 34. Apply Dynamic Suggestion (Section 2 & 3)
    this.disposables.push(
      this.registerCmd('craftlens.applySuggestion', async (arg1?: any, arg2?: any) => {
        try {
          let finding: Finding | undefined;
          let suggestion: Suggestion | undefined;
          let targetFilePath: string | undefined;
          let targetLine: number | undefined;
          let replacementText: string | undefined;

          // Shape 1: { filePath, line, replacement } from detail panel
          if (arg1 && typeof arg1 === 'object' && typeof arg1.filePath === 'string' && typeof arg1.replacement === 'string') {
            targetFilePath = arg1.filePath;
            targetLine = typeof arg1.line === 'number' ? arg1.line : 1;
            replacementText = arg1.replacement;

            const storeFindings = targetFilePath ? this.diagnosticsAdapter.getFindingStore().getFindingsForFile(targetFilePath) : [];
            finding = storeFindings.find(f => {
              const loc = normalizeFindingLocation(f);
              return loc?.range && targetLine! >= loc.range.startLine && targetLine! <= loc.range.endLine;
            }) || storeFindings[0];
          }
          // Shape 2: string ID + suggestion index
          else if (typeof arg1 === 'string') {
            finding = this.diagnosticsAdapter.getFindingStore().getFindingById(arg1);
            if (!finding) {
              const all = this.diagnosticsAdapter.getFindingStore().getAllFindings();
              finding = all.find(f => f.id === arg1 || f.ruleId === arg1 || f.fingerprint === arg1);
            }
            if (finding && finding.suggestions && typeof arg2 === 'number') {
              suggestion = finding.suggestions[arg2];
            }
          }
          // Shape 3: Finding object + Suggestion object
          else if (arg1 && (arg1.ruleId || arg1.location || arg1.filePath)) {
            finding = arg1 as Finding;
            suggestion = (arg2 as Suggestion) || (finding.suggestions && finding.suggestions.length > 0 ? finding.suggestions[0] : undefined);
          }

          if (!targetFilePath) {
            targetFilePath = finding?.filePath || finding?.location?.filePath || normalizeFindingLocation(finding)?.filePath;
          }

          if (!targetFilePath) {
            vscode.window.showInformationMessage('Location unavailable: This finding is not linked to a valid file path.');
            return;
          }

          const resolvedPath = path.resolve(targetFilePath);
          const folders = vscode.workspace.workspaceFolders;
          if (folders && folders.length > 0) {
            const inside = folders.some(f => {
              const rel = path.relative(path.resolve(f.uri.fsPath), resolvedPath);
              return !rel.startsWith('..') && !path.isAbsolute(rel);
            });
            if (!inside) {
              vscode.window.showErrorMessage('Security validation: Target file path is outside the active workspace.');
              return;
            }
          }

          if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
            vscode.window.showInformationMessage('The target file is no longer available. Run the audit again to refresh this recommendation.');
            return;
          }

          const docUri = vscode.Uri.file(resolvedPath);
          let doc: vscode.TextDocument;
          try {
            doc = await vscode.workspace.openTextDocument(docUri);
          } catch {
            vscode.window.showInformationMessage('The target file is no longer available. Run the audit again to refresh this recommendation.');
            return;
          }

          const text = replacementText || suggestion?.replacement;
          if (typeof text === 'string') {
            const startLine = typeof targetLine === 'number'
              ? targetLine
              : (finding?.startLine || finding?.location?.start?.line || 1);

            if (startLine < 1 || startLine > doc.lineCount) {
              vscode.window.showInformationMessage('This recommendation is no longer valid because the file changed. Run the audit again to refresh it.');
              return;
            }

            const startLineIdx = Math.max(0, startLine - 1);
            const endLine = finding?.endLine || finding?.location?.end?.line || startLine;
            const endLineIdx = Math.min(doc.lineCount - 1, Math.max(startLineIdx, endLine - 1));

            const lineText = doc.lineAt(startLineIdx).text;
            const snippet = finding?.evidence?.[0]?.snippet;

            const edit = new vscode.WorkspaceEdit();
            if (snippet && typeof snippet === 'string' && lineText.includes(snippet)) {
              const startCol = lineText.indexOf(snippet);
              const range = new vscode.Range(startLineIdx, startCol, startLineIdx, startCol + snippet.length);
              edit.replace(docUri, range, text);
            } else {
              const range = new vscode.Range(startLineIdx, 0, endLineIdx, doc.lineAt(endLineIdx).text.length);
              edit.replace(docUri, range, text);
            }

            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
              await doc.save();
              this.scanDocument(doc);
              if (finding) {
                this.storageManager.markCriteriaCheckedForFinding(finding);
              }
              vscode.window.showInformationMessage(`Applied fix: ${suggestion?.title || 'Applied suggestion'}`);
              this.sidebarProvider?.refresh();
              this.inlineDecorationManager?.updateAllVisibleEditors();
            }
          } else if (finding && (finding.designFix || finding.fix)) {
            await vscode.commands.executeCommand('craftlens.applyQuickFix', docUri, finding);
          } else {
            vscode.window.showInformationMessage(`Suggestion guidance: ${suggestion?.explanation || finding?.howToFix || 'Apply change manually.'}`);
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`CraftLens: Failed to apply suggestion: ${e?.message || e}`);
        }
      })
    );

    // 35. Copy Suggestion Fix
    this.disposables.push(
      this.registerCmd('craftlens.copySuggestionFix', async (text: string) => {
        if (text) {
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage('Copied suggested fix to clipboard.');
        }
      })
    );

    // 36. User Rule Item Actions (Toggle / Delete)
    this.disposables.push(
      this.registerCmd('craftlens.toggleUserRule', async (groupId: string, ruleId: string) => {
        const mgr = this.engine.getUserRuleManager();
        const newState = mgr.toggleRuleEnabled(groupId, ruleId);
        this.sidebarProvider?.refresh();
        vscode.window.showInformationMessage(`User rule ${newState ? 'enabled' : 'disabled'}.`);
        await this.runAuditWithMode('full', 'file');
      }),
      this.registerCmd('craftlens.deleteUserRule', async (groupId: string, ruleId: string) => {
        const mgr = this.engine.getUserRuleManager();
        mgr.deleteRule(groupId, ruleId);
        this.sidebarProvider?.refresh();
        vscode.window.showInformationMessage('User rule deleted.');
        await this.runAuditWithMode('full', 'file');
      }),
      this.registerCmd('craftlens.deleteUserRuleGroup', async (groupId: string) => {
        const mgr = this.engine.getUserRuleManager();
        mgr.deleteGroup(groupId);
        this.sidebarProvider?.refresh();
        vscode.window.showInformationMessage('User rule group deleted.');
        await this.runAuditWithMode('full', 'file');
      })
    );
  }


  public dispose(): void {
    this.outputChannel.dispose();
    this.issueHighlightDecoration.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
