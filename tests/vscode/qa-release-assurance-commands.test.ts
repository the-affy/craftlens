import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';

const registeredCommands = new Map<string, (...args: any[]) => any>();
let createdWebviewPanels: any[] = [];

vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: vi.fn(async () => undefined),
      showWarningMessage: vi.fn(async () => undefined),
      showErrorMessage: vi.fn(async () => undefined),
      showQuickPick: vi.fn(),
      showOpenDialog: vi.fn(),
      showInputBox: vi.fn(),
      createWebviewPanel: vi.fn((viewType: string, title: string, showOptions: any, options: any) => {
        const panel = {
          viewType,
          title,
          showOptions,
          options,
          webview: {
            html: '',
            onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
            postMessage: vi.fn(),
          },
          reveal: vi.fn(),
          dispose: vi.fn(),
          onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        };
        createdWebviewPanels.push(panel);
        return panel;
      }),
      withProgress: vi.fn(async (_opts, task) => {
        return task({ report: vi.fn() }, { isCancellationRequested: false });
      }),
      createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
      createStatusBarItem: vi.fn(() => ({
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        text: '',
        tooltip: '',
        command: '',
      })),
      showTextDocument: vi.fn(async () => ({})),
      activeTextEditor: undefined,
    },
    commands: {
      executeCommand: vi.fn(async (cmd: string, ...args: any[]) => {
        const handler = registeredCommands.get(cmd);
        if (handler) {
          return handler(...args);
        }
        return undefined;
      }),
      registerCommand: vi.fn((cmd: string, handler: (...args: any[]) => any) => {
        registeredCommands.set(cmd, handler);
        return {
          dispose: () => {
            registeredCommands.delete(cmd);
          },
        };
      }),
    },
    languages: {
      createDiagnosticCollection: vi.fn(() => ({
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    workspace: {
      workspaceFolders: [
        {
          uri: { fsPath: '/mock/workspace' },
          name: 'mock-workspace',
        },
      ],
      getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, defaultValue: any) => defaultValue),
        update: vi.fn(),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      openTextDocument: vi.fn(async (uri: any) => ({
        uri: typeof uri === 'string' ? { fsPath: uri } : uri,
        getText: () => '',
        version: 1,
      })),
      registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file', toString: () => `file://${p}` }),
      joinPath: (base: any, ...seg: string[]) => ({
        fsPath: path.join(base.fsPath || base, ...seg),
        scheme: 'file',
      }),
    },
    ViewColumn: {
      One: 1,
      Beside: 2,
    },
    ThemeColor: class {
      constructor(public id: string) {}
    },
    EventEmitter: class {
      private listeners: ((e: any) => any)[] = [];
      public event = (listener: (e: any) => any) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
      public fire = (e: any) => {
        for (const l of this.listeners) l(e);
      };
    },
    ProgressLocation: {
      Notification: 15,
      Window: 10,
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
  };
});

import * as vscode from 'vscode';
import {
  FindingStore,
  IssueRegistry,
  ProjectContext,
  AuditStorageManager,
} from '@craftlens/core';
import { RuleRegistry, RuleEngine } from '@craftlens/rule-engine';
import { AstCache } from '@craftlens/parser';
import { DiagnosticsCollectionAdapter } from '../../apps/vscode-extension/src/diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { CraftLensStatusBar } from '../../apps/vscode-extension/src/status/status-bar.js';
import { CommandManager } from '../../apps/vscode-extension/src/commands/command-manager.js';
import { ProjectOverviewPanel } from '../../apps/vscode-extension/src/overview/project-overview-panel.js';

describe('QA & Release Assurance Commands & Overview Integration', () => {
  const root = path.resolve(__dirname, '../..');
  let findingStore: FindingStore;
  let issueRegistry: IssueRegistry;
  let commandManager: CommandManager;

  beforeEach(() => {
    registeredCommands.clear();
    createdWebviewPanels = [];
    ProjectOverviewPanel.currentPanel?.dispose();
    ProjectOverviewPanel.currentPanel = undefined;

    findingStore = new FindingStore();
    issueRegistry = findingStore.getIssueRegistry();
    issueRegistry.setWorkspaceRoot(root);

    const registry = new RuleRegistry();
    const engine = new RuleEngine(registry, new AstCache());
    const diagAdapter = new DiagnosticsCollectionAdapter();
    const configMgr = new ConfigurationManager();
    const storageMgr = new AuditStorageManager(root);
    const statusBar = new CraftLensStatusBar();
    const projectContext: ProjectContext = {
      workspaceRoot: root,
      projectName: 'craftlens',
      hasTsConfig: true,
      isMonorepo: true,
    } as any;

    commandManager = new CommandManager(
      engine,
      diagAdapter,
      configMgr,
      storageMgr,
      statusBar,
      projectContext,
      undefined,
      undefined,
      undefined,
      vscode.Uri.file('/mock/extension')
    );
  });

  it('declares and registers craftlens.runQA, craftlens.runSelfQA, and craftlens.verifyRelease', () => {
    const pkgPath = path.join(root, 'apps', 'vscode-extension', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const declaredCmdIds = pkg.contributes.commands.map((c: any) => c.command);

    expect(declaredCmdIds).toContain('craftlens.runQA');
    expect(declaredCmdIds).toContain('craftlens.runSelfQA');
    expect(declaredCmdIds).toContain('craftlens.verifyRelease');

    expect(registeredCommands.has('craftlens.runQA')).toBe(true);
    expect(registeredCommands.has('craftlens.runSelfQA')).toBe(true);
    expect(registeredCommands.has('craftlens.verifyRelease')).toBe(true);
  });

  it('executes executeQAMode cleanly and returns a comprehensive QAReport', async () => {
    const report = await commandManager.executeQAMode('quick');

    expect(report).toBeDefined();
    expect(report.mode).toBe('quick');
    expect(['RELEASE PASS', 'RELEASE PASS WITH WARNINGS', 'RELEASE BLOCKED']).toContain(report.gateResult);
    expect(report.checks.length).toBeGreaterThan(0);
    expect(typeof report.durationMs).toBe('number');
  });

  it('renders QA & Release tab, action triggers, and gate badge in ProjectOverviewPanel HTML', async () => {
    await vscode.commands.executeCommand('craftlens.openProjectOverview');
    expect(createdWebviewPanels.length).toBeGreaterThan(0);
    const panel = createdWebviewPanels[0];

    const overviewInstance = ProjectOverviewPanel.currentPanel;
    expect(overviewInstance).toBeDefined();

    // Switch to QA tab
    (overviewInstance as any).activeSubTab = 'qa';
    (overviewInstance as any).updateWebview();

    const html = panel.webview.html;
    expect(html).toContain('QA &amp; Release');
    expect(html).toContain('QA Release Gate');
    expect(html).toContain('runQA()');
    expect(html).toContain('runSelfQA()');
    expect(html).toContain('verifyRelease()');
    expect(html).toContain('Automated QA Checks');
  });
});
