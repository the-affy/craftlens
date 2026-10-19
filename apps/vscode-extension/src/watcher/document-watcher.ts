import * as vscode from 'vscode';
import { RuleEngine } from '@anti-slop/rule-engine';
import { ProjectContext } from '@anti-slop/core';
import { DiagnosticsCollectionAdapter } from '../diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../configuration/config-manager.js';

export interface DocumentWatcherOptions {
  engine: RuleEngine;
  diagnosticsAdapter: DiagnosticsCollectionAdapter;
  configManager: ConfigurationManager;
  projectContext?: ProjectContext;
  debounceMs?: number;
}

export class DocumentWatcher {
  private engine: RuleEngine;
  private diagnosticsAdapter: DiagnosticsCollectionAdapter;
  private configManager: ConfigurationManager;
  private projectContext?: ProjectContext;
  private debounceMs: number;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private disposables: vscode.Disposable[] = [];

  constructor(options: DocumentWatcherOptions) {
    this.engine = options.engine;
    this.diagnosticsAdapter = options.diagnosticsAdapter;
    this.configManager = options.configManager;
    this.projectContext = options.projectContext;
    this.debounceMs = options.debounceMs ?? 300;

    this.registerListeners();
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
      path.endsWith('.cjs')
    );
  }

  private registerListeners(): void {
    // 1. Text changed (debounced fast path)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const config = this.configManager.getConfig();
        if (!config.enabled || !config.scanOnChange) return;
        if (!this.isSupportedDocument(event.document)) return;

        this.scheduleScan(event.document);
      })
    );

    // 2. Document opened
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        const config = this.configManager.getConfig();
        if (!config.enabled) return;
        if (!this.isSupportedDocument(doc)) return;

        this.scanDocument(doc);
      })
    );

    // 3. Document saved (scan on save)
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        const config = this.configManager.getConfig();
        if (!config.enabled || !config.scanOnSave) return;
        if (!this.isSupportedDocument(doc)) return;

        this.scanDocument(doc);
      })
    );

    // 4. Document closed (clear diagnostics and cache)
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument(doc => {
        this.diagnosticsAdapter.clear(doc.uri);
        this.engine.getAstCache().invalidate(doc.uri.fsPath);
      })
    );
  }

  public scheduleScan(doc: vscode.TextDocument): void {
    const key = doc.uri.fsPath;
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.scanDocument(doc);
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  public scanDocument(doc: vscode.TextDocument): void {
    if (!this.isSupportedDocument(doc)) return;

    const config = this.configManager.getConfig();
    const result = this.engine.analyze({
      filePath: doc.uri.fsPath,
      sourceText: doc.getText(),
      version: doc.version,
      config,
      projectContext: this.projectContext,
    });

    this.diagnosticsAdapter.update(doc.uri, result.findings);
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
