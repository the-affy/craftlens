import * as vscode from 'vscode';
import { detectProjectContext, ProjectContext } from '@anti-slop/core';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '@anti-slop/rule-engine';
import { AstCache } from '@anti-slop/parser';
import { DiagnosticsCollectionAdapter } from './diagnostics/collection-adapter.js';
import { ConfigurationManager } from './configuration/config-manager.js';
import { DocumentWatcher } from './watcher/document-watcher.js';
import { AntiSlopCodeActionProvider } from './code-actions/action-provider.js';
import { CommandManager } from './commands/command-manager.js';

let watcher: DocumentWatcher | undefined;
let diagnosticsAdapter: DiagnosticsCollectionAdapter | undefined;
let configManager: ConfigurationManager | undefined;
let commandManager: CommandManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // 1. Initialize Engine & Rules
  const registry = new RuleRegistry();
  registerDefaultRules(registry);

  const astCache = new AstCache();
  const engine = new RuleEngine(registry, astCache);

  // 2. Initialize Diagnostics & Configuration
  diagnosticsAdapter = new DiagnosticsCollectionAdapter();
  configManager = new ConfigurationManager();

  // 3. Detect Project Context
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const rootPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '/';
  const projectContext: ProjectContext = detectProjectContext({ rootPath });

  // 4. Initialize Document Watcher (Fast incremental analysis)
  watcher = new DocumentWatcher({
    engine,
    diagnosticsAdapter,
    configManager,
    projectContext,
  });

  // 5. Register Code Actions Provider
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

  // 6. Register Commands
  commandManager = new CommandManager(engine, diagnosticsAdapter, configManager);

  // 7. Subscribe to configuration updates
  context.subscriptions.push(
    configManager.onDidChange(() => {
      // Re-scan active text editor when config changes
      if (vscode.window.activeTextEditor) {
        watcher?.scanDocument(vscode.window.activeTextEditor.document);
      }
    })
  );

  // 8. Initial scan of active editor if open
  if (vscode.window.activeTextEditor) {
    watcher.scanDocument(vscode.window.activeTextEditor.document);
  }

  // Register remaining disposables
  context.subscriptions.push(
    diagnosticsAdapter,
    configManager,
    watcher,
    commandManager
  );
}

export function deactivate(): void {
  watcher?.dispose();
  diagnosticsAdapter?.dispose();
  configManager?.dispose();
  commandManager?.dispose();
}
