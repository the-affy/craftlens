import * as vscode from 'vscode';
import * as path from 'node:path';
import { detectProjectContext, ProjectContext, AuditStorageManager } from '@craftlens/core';
import { RuleRegistry, RuleEngine, registerDefaultRules, CustomRuleLoader } from '@craftlens/rule-engine';
import { AstCache } from '@craftlens/parser';
import { DiagnosticsCollectionAdapter } from './diagnostics/collection-adapter.js';
import { ConfigurationManager } from './configuration/config-manager.js';
import { DocumentWatcher } from './watcher/document-watcher.js';
import { CraftLensCodeActionProvider } from './code-actions/action-provider.js';
import { CommandManager } from './commands/command-manager.js';
import { CraftLensStatusBar } from './status/status-bar.js';
import { CraftLensHoverProvider } from './hover/hover-provider.js';
import { CraftLensCodeLensProvider } from './codelens/codelens-provider.js';

import { CraftLensSidebarProvider } from './sidebar/sidebar-provider.js';
import { CraftLensDetailViewProvider } from './sidebar/detail-panel-provider.js';
import { CraftLensInlineDecorationManager } from './decorations/inline-decorations.js';
import { CraftLensInlayHintsProvider } from './inlay/inlay-hints-provider.js';

let watcher: DocumentWatcher | undefined;
let diagnosticsAdapter: DiagnosticsCollectionAdapter | undefined;
let configManager: ConfigurationManager | undefined;
let commandManager: CommandManager | undefined;
let statusBar: CraftLensStatusBar | undefined;
let codeLensProvider: CraftLensCodeLensProvider | undefined;
let sidebarProvider: CraftLensSidebarProvider | undefined;
let detailPanelProvider: CraftLensDetailViewProvider | undefined;
let inlineDecorationManager: CraftLensInlineDecorationManager | undefined;
let inlayHintsProvider: CraftLensInlayHintsProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // 1. Initialize Engine & Rules
  const registry = new RuleRegistry();
  registerDefaultRules(registry);

  // 2. Discover rootPath & Load Custom Rules
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const rootPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '/';

  const customRulesDir = path.join(rootPath, '.craftlens', 'rules');
  CustomRuleLoader.loadCustomRulesFromDir(customRulesDir, registry);

  const astCache = new AstCache();
  const engine = new RuleEngine(registry, astCache);

  // 3. Initialize Diagnostics & Configuration
  diagnosticsAdapter = new DiagnosticsCollectionAdapter();
  configManager = new ConfigurationManager();

  // 4. Detect Project Context & Initialize Persistent Storage
  const projectContext: ProjectContext = detectProjectContext({ rootPath });
  const storageManager = new AuditStorageManager(rootPath);
  if (workspaceFolders && workspaceFolders.length > 0) {
    storageManager.ensureDefaultProjectConfig();
  }
  configManager.setStorageManager(storageManager);

  // 5. Initialize FindingStore & Sidebar Tree Provider
  const findingStore = diagnosticsAdapter.getFindingStore();
  engine.getSkillManager().loadProjectSkills();
  sidebarProvider = new CraftLensSidebarProvider(
    findingStore,
    storageManager,
    configManager,
    engine,
    projectContext
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CraftLensSidebarProvider.viewType,
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // 5b. Initialize Detail Panel Provider (Bottom Panel Webview)
  detailPanelProvider = new CraftLensDetailViewProvider(context.extensionUri, engine.getSkillManager());
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CraftLensDetailViewProvider.viewType,
      detailPanelProvider
    )
  );

  // 6. Initialize Status Bar
  statusBar = new CraftLensStatusBar();
  const existingAudit = storageManager.loadAudit();
  if (existingAudit) {
    statusBar.updateFromChecklist(existingAudit);
  }

  // 7. Initialize CodeLens, InlayHints & Inline Decoration Providers
  codeLensProvider = new CraftLensCodeLensProvider(diagnosticsAdapter, configManager);
  inlayHintsProvider = new CraftLensInlayHintsProvider(diagnosticsAdapter, configManager);
  inlineDecorationManager = new CraftLensInlineDecorationManager(diagnosticsAdapter);

  // 8. Initialize Document Watcher (Continuous Auto-Audit)
  watcher = new DocumentWatcher({
    engine,
    diagnosticsAdapter,
    configManager,
    statusBar,
    codeLensProvider,
    storageManager,
    sidebarProvider,
    projectContext,
    inlineDecorationManager,
    inlayHintsProvider,
  });

  // 9. Register Language Providers (Code Actions, Hover, CodeLens, InlayHints)
  const selector: vscode.DocumentSelector = [
    { language: 'javascript', scheme: 'file' },
    { language: 'javascriptreact', scheme: 'file' },
    { language: 'typescript', scheme: 'file' },
    { language: 'typescriptreact', scheme: 'file' },
    { language: 'html', scheme: 'file' },
    { language: 'vue', scheme: 'file' },
    { language: 'svelte', scheme: 'file' },
    { language: 'css', scheme: 'file' },
  ];

  const codeActionProvider = new CraftLensCodeActionProvider(diagnosticsAdapter);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, {
      providedCodeActionKinds: CraftLensCodeActionProvider.providedCodeActionKinds,
    })
  );

  const hoverProvider = new CraftLensHoverProvider(diagnosticsAdapter);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, hoverProvider)
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider)
  );

  context.subscriptions.push(
    vscode.languages.registerInlayHintsProvider(selector, inlayHintsProvider)
  );

  // 10. Register Commands
  commandManager = new CommandManager(
    engine,
    diagnosticsAdapter,
    configManager,
    storageManager,
    statusBar,
    projectContext,
    sidebarProvider,
    detailPanelProvider,
    inlineDecorationManager,
    context.extensionUri
  );

  // 11. Subscribe to configuration updates
  context.subscriptions.push(
    configManager.onDidChange(() => {
      try {
        codeLensProvider?.refresh();
        inlayHintsProvider?.refresh();
        inlineDecorationManager?.updateAllVisibleEditors();
        if (vscode.window.activeTextEditor) {
          watcher?.scanDocument(vscode.window.activeTextEditor.document);
        }
      } catch (err: any) {
        console.error('[CraftLens] config change handler failure:', err);
      }
    })
  );

  // 12. Initial scan of active editor if open
  if (vscode.window.activeTextEditor) {
    try {
      watcher.scanDocument(vscode.window.activeTextEditor.document);
    } catch (err: any) {
      console.error('[CraftLens] Initial scan failure:', err);
    }
  }

  // Register remaining disposables
  context.subscriptions.push(
    diagnosticsAdapter,
    configManager,
    statusBar,
    watcher,
    commandManager,
    inlineDecorationManager,
    sidebarProvider,
    detailPanelProvider
  );
}

export function deactivate(): void {
  sidebarProvider?.dispose();
  detailPanelProvider?.dispose();
  watcher?.dispose();
  diagnosticsAdapter?.dispose();
  configManager?.dispose();
  commandManager?.dispose();
  statusBar?.dispose();
  inlineDecorationManager?.dispose();
}
