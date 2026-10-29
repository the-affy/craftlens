import * as vscode from 'vscode';
import { RuleEngine } from '@craftlens/rule-engine';
import {
  AuditStorageManager,
  Finding,
  ProjectContext,
  generateChangeReview,
  formatChangeReviewMarkdown,
} from '@craftlens/core';
import { DiagnosticsCollectionAdapter } from '../diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../configuration/config-manager.js';
import { CraftLensStatusBar } from '../status/status-bar.js';
import { CraftLensCodeLensProvider } from '../codelens/codelens-provider.js';

import { CraftLensSidebarProvider } from '../sidebar/sidebar-provider.js';
import { CraftLensInlineDecorationManager } from '../decorations/inline-decorations.js';
import { CraftLensInlayHintsProvider } from '../inlay/inlay-hints-provider.js';

export interface DocumentWatcherOptions {
  engine: RuleEngine;
  diagnosticsAdapter: DiagnosticsCollectionAdapter;
  configManager: ConfigurationManager;
  statusBar: CraftLensStatusBar;
  codeLensProvider: CraftLensCodeLensProvider;
  storageManager: AuditStorageManager;
  sidebarProvider?: CraftLensSidebarProvider;
  projectContext?: ProjectContext;
  inlineDecorationManager?: CraftLensInlineDecorationManager;
  inlayHintsProvider?: CraftLensInlayHintsProvider;
  debounceMs?: number;
}

export class DocumentWatcher {
  private engine: RuleEngine;
  private diagnosticsAdapter: DiagnosticsCollectionAdapter;
  private configManager: ConfigurationManager;
  private statusBar: CraftLensStatusBar;
  private codeLensProvider: CraftLensCodeLensProvider;
  private storageManager: AuditStorageManager;
  private sidebarProvider?: CraftLensSidebarProvider;
  private projectContext?: ProjectContext;
  private inlineDecorationManager?: CraftLensInlineDecorationManager;
  private inlayHintsProvider?: CraftLensInlayHintsProvider;
  private debounceMs: number;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private scheduledVersions = new Map<string, number>();
  private disposables: vscode.Disposable[] = [];

  constructor(options: DocumentWatcherOptions) {
    this.engine = options.engine;
    this.diagnosticsAdapter = options.diagnosticsAdapter;
    this.configManager = options.configManager;
    this.statusBar = options.statusBar;
    this.codeLensProvider = options.codeLensProvider;
    this.storageManager = options.storageManager;
    this.sidebarProvider = options.sidebarProvider;
    this.projectContext = options.projectContext;
    this.inlineDecorationManager = options.inlineDecorationManager;
    this.inlayHintsProvider = options.inlayHintsProvider;
    this.debounceMs = options.debounceMs ?? 300;

    this.registerListeners();
  }

  public setSidebarProvider(provider: CraftLensSidebarProvider): void {
    this.sidebarProvider = provider;
  }

  public setProjectContext(context: ProjectContext): void {
    this.projectContext = context;
  }

  private isSupportedDocument(doc: vscode.TextDocument): boolean {
    if (doc.uri.scheme !== 'file') return false;
    const path = doc.uri.fsPath.toLowerCase();
    return (
      path.endsWith('.ts') ||
      path.endsWith('.tsx') ||
      path.endsWith('.js') ||
      path.endsWith('.jsx') ||
      path.endsWith('.mjs') ||
      path.endsWith('.cjs') ||
      path.endsWith('.html') ||
      path.endsWith('.htm') ||
      path.endsWith('.vue') ||
      path.endsWith('.svelte') ||
      path.endsWith('.css')
    );
  }

  private registerListeners(): void {
    // 1. Text changed (debounced fast path)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        try {
          const config = this.configManager.getConfig();
          if (!config.enabled || !config.scanOnChange || !config.autoAudit) return;
          if (!this.isSupportedDocument(event.document)) return;

          this.statusBar.updateReviewing();
          this.scheduleScan(event.document);
        } catch (err: any) {
          console.error('[CraftLens] DocumentWatcher onDidChangeTextDocument failure:', {
            eventName: 'onDidChangeTextDocument',
            file: event?.document?.uri?.fsPath,
            errorMessage: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
      })
    );

    // 2. Document opened
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        try {
          const config = this.configManager.getConfig();
          if (!config.enabled) return;
          if (!this.isSupportedDocument(doc)) return;

          this.scanDocument(doc, false);
        } catch (err: any) {
          console.error('[CraftLens] DocumentWatcher onDidOpenTextDocument failure:', {
            eventName: 'onDidOpenTextDocument',
            file: doc?.uri?.fsPath,
            errorMessage: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
      })
    );

    // 3. Document saved (scan on save & persist, debounced/coalesced)
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        try {
          const config = this.configManager.getConfig();
          if (!config.enabled || !config.scanOnSave) return;
          if (!this.isSupportedDocument(doc)) return;

          this.scheduleSaveScan(doc);
        } catch (err: any) {
          console.error('[CraftLens] DocumentWatcher onDidSaveTextDocument failure:', {
            eventName: 'onDidSaveTextDocument',
            file: doc?.uri?.fsPath,
            errorMessage: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
      })
    );

    // 4. Document closed (clear diagnostics and cache)
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument(doc => {
        try {
          this.diagnosticsAdapter.clear(doc.uri);
          this.engine.getAstCache().invalidate(doc.uri.fsPath);
          this.codeLensProvider.refresh();
        } catch (err: any) {
          console.error('[CraftLens] DocumentWatcher onDidCloseTextDocument failure:', {
            eventName: 'onDidCloseTextDocument',
            file: doc?.uri?.fsPath,
            errorMessage: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
      })
    );
  }

  public scheduleScan(doc: vscode.TextDocument): void {
    try {
      const key = doc.uri.fsPath;
      const version = doc.version;
      this.scheduledVersions.set(key, version);

      const existing = this.debounceTimers.get(key);
      if (existing) {
        clearTimeout(existing);
      }

      const timer = setTimeout(() => {
        this.debounceTimers.delete(key);
        // Cancel stale analysis if another change arrived in the meantime or doc closed
        if (doc.isClosed || doc.version !== this.scheduledVersions.get(key)) {
          return;
        }
        this.scanDocument(doc, false);
      }, this.debounceMs);

      this.debounceTimers.set(key, timer);
    } catch (err: any) {
      console.error('[CraftLens] scheduleScan failure:', err);
    }
  }

  public scheduleSaveScan(doc: vscode.TextDocument): void {
    try {
      const key = `save_${doc.uri.fsPath}`;
      const version = doc.version;
      this.scheduledVersions.set(key, version);

      const existing = this.debounceTimers.get(key);
      if (existing) {
        clearTimeout(existing);
      }

      const timer = setTimeout(() => {
        this.debounceTimers.delete(key);
        // Cancel stale analysis if doc closed or new version saved
        if (doc.isClosed || doc.version !== this.scheduledVersions.get(key)) {
          return;
        }
        this.scanDocument(doc, true);
      }, this.debounceMs);

      this.debounceTimers.set(key, timer);
    } catch (err: any) {
      console.error('[CraftLens] scheduleSaveScan failure:', err);
    }
  }

  public scanDocument(doc: vscode.TextDocument, persistOnDisk = false): void {
    try {
      if (!this.isSupportedDocument(doc)) return;

      const config = this.configManager.getConfig();
      const prevFindings = this.diagnosticsAdapter.getFindingsForFile(doc.uri.fsPath);

      const result = this.engine.analyze({
        filePath: doc.uri.fsPath,
        sourceText: doc.getText(),
        version: doc.version,
        config,
        projectContext: this.projectContext,
      });

      // Update Diagnostics Collection
      this.diagnosticsAdapter.update(doc.uri, result.findings);
      this.sidebarProvider?.refresh();

      // Trigger CodeLens, InlayHints & In-Code Highlight update
      this.codeLensProvider.refresh();
      this.inlayHintsProvider?.refresh();
      this.inlineDecorationManager?.updateAllVisibleEditors();

      // Check for newly introduced findings vs resolved findings (only persist on save or explicit scan)
      if (persistOnDisk && (prevFindings.length > 0 || result.findings.length > 0)) {
        const relPath = vscode.workspace.asRelativePath(doc.uri);
        const changeReview = generateChangeReview(
          [relPath],
          prevFindings,
          result.findings
        );

        // Save recent change review if new issues were introduced
        if (changeReview.newFindings.length > 0) {
          const reviewMd = formatChangeReviewMarkdown(changeReview);
          this.storageManager.saveChangeReview(reviewMd);
        }

        // Maintain persistent change log of all changes made by user
        if (changeReview.newFindings.length > 0 || changeReview.resolvedFindings.length > 0) {
          this.storageManager.appendUserChange(
            {
              id: `chg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              timestamp: Date.now(),
              filesChanged: [relPath],
              linesAdded: changeReview.linesAdded,
              linesRemoved: changeReview.linesRemoved,
              resolvedFindings: changeReview.resolvedFindings.map(f => ({
                ruleId: f.ruleId,
                message: f.message || f.whatIsWrong || '',
                filePath: relPath,
              })),
              newFindings: changeReview.newFindings.map(f => ({
                ruleId: f.ruleId,
                message: f.message || f.whatIsWrong || '',
                filePath: relPath,
              })),
              qualityScores: changeReview.qualityScores,
              source: 'editor-save',
            },
            this.projectContext?.projectName
          );
        }
      }

      // Continuous Master Audit Checklist Synchronization (only persist on disk on save or if required)
      if (persistOnDisk && config.persistAudit && this.projectContext) {
        const allFindings: Finding[] = [];
        for (const list of this.diagnosticsAdapter.getAllFindings().values()) {
          allFindings.push(...list);
        }

        const { checklist } = this.storageManager.syncAudit(
          this.projectContext,
          allFindings,
          config.auditLevel
        );

        this.statusBar.updateFromChecklist(checklist);
      } else {
        const existingAudit = this.storageManager.loadAudit();
        if (existingAudit) {
          this.statusBar.updateFromChecklist(existingAudit);
        } else {
          this.statusBar.updateIdle();
        }
      }
    } catch (err: any) {
      console.error('[CraftLens] scanDocument failure:', {
        file: doc?.uri?.fsPath,
        errorMessage: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  public dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
