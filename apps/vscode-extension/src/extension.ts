import * as vscode from 'vscode';
import { detectProjectContext, ProjectContext, AuditStorageManager } from '@anti-slop/core';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '@anti-slop/rule-engine';
import { AstCache } from '@anti-slop/parser';
import { DiagnosticsCollectionAdapter } from './diagnostics/collection-adapter.js';
import { ConfigurationManager } from './configuration/config-manager.js';
import { DocumentWatcher } from './watcher/document-watcher.js';
import { AntiSlopCodeActionProvider } from './code-actions/action-provider.js';
import { CommandManager } from './commands/command-manager.js';
import { AntiSlopStatusBar } from './status/status-bar.js';
import { AntiSlopHoverProvider } from './hover/hover-provider.js';
import { AntiSlopCodeLensProvider } from './codelens/codelens-provider.js';

let watcher: DocumentWatcher | undefined;
let diagnosticsAdapter: DiagnosticsCollectionAdapter | undefined;
let configManager: ConfigurationManager | undefined;
let commandManager: CommandManager | undefined;
let statusBar: AntiSlopStatusBar | undefined;
let codeLensProvider: AntiSlopCodeLensProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // 1. Initialize Engine & Rules
  const registry = new RuleRegistry();
  registerDefaultRules(registry);

  const astCache = new AstCache();
  const engine = new RuleEngine(registry, astCache);

  // 2. Initialize Diagnostics & Configuration
  diagnosticsAdapter = new DiagnosticsCollectionAdapter();
  configManager = new ConfigurationManager();

  // 3. Detect Project Context & Initialize Persistent Storage
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const rootPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '/';
  const projectContext: ProjectContext = detectProjectContext({ rootPath });
  const storageManager = new AuditStorageManager(rootPath);

  // 4. Initialize Status Bar
  statusBar = new AntiSlopStatusBar();
  const existingAudit = storageManager.loadAudit();
  if (existingAudit) {
    statusBar.updateFromChecklist(existingAudit);
  }

  // 5. Initialize CodeLens Provider
  codeLensProvider = new AntiSlopCodeLensProvider(diagnosticsAdapter, configManager);

  // 6. Initialize Document Watcher (Continuous Auto-Audit)
  watcher = new DocumentWatcher({
    engine,
    diagnosticsAdapter,
    configManager,
    statusBar,
    codeLensProvider,
    storageManager,
    projectContext,
  });

  // 7. Register Language Providers (Code Actions, Hover, CodeLens)
  const selector: vscode.DocumentSelector = [
    { language: 'javascript', scheme: 'file' },
    { language: 'javascriptreact', scheme: 'file' },
    { language: 'typescript', scheme: 'file' },
    { language: 'typescriptreact', scheme: 'file' },
  ];

  const codeActionProvider = new AntiSlopCodeActionProvider(diagnosticsAdapter);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, {
      providedCodeActionKinds: AntiSlopCodeActionProvider.providedCodeActionKinds,
    })
  );

  const hoverProvider = new AntiSlopHoverProvider(diagnosticsAdapter);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, hoverProvider)
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider)
  );

  // 8. Register Commands
  commandManager = new CommandManager(
    engine,
    diagnosticsAdapter,
    configManager,
    storageManager,
    statusBar,
    projectContext
  );

  // 9. Subscribe to configuration updates
  context.subscriptions.push(
    configManager.onDidChange(() => {
      codeLensProvider?.refresh();
      if (vscode.window.activeTextEditor) {
        watcher?.scanDocument(vscode.window.activeTextEditor.document);
      }
    })
  );

  // 10. Initial scan of active editor if open
  if (vscode.window.activeTextEditor) {
    watcher.scanDocument(vscode.window.activeTextEditor.document);
  }

  // Register remaining disposables
  context.subscriptions.push(
    diagnosticsAdapter,
    configManager,
    statusBar,
    watcher,
    commandManager
  );
}

export function deactivate(): void {
  watcher?.dispose();
  diagnosticsAdapter?.dispose();
  configManager?.dispose();
  commandManager?.dispose();
  statusBar?.dispose();
}
