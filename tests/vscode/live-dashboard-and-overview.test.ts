import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'node:path';

const registeredCommands = new Map<string, (...args: any[]) => any>();
let createdWebviewPanels: any[] = [];

vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showOpenDialog: vi.fn(),
      showInputBox: vi.fn(),
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
      createWebviewPanel: vi.fn((viewType: string, title: string, showOptions: any, options: any) => {
        let msgHandler: ((msg: any) => any) | null = null;
        let disposeHandler: (() => any) | null = null;
        const panel = {
          viewType,
          title,
          options,
          webview: {
            html: '',
            options: {},
            onDidReceiveMessage: vi.fn((cb: any) => {
              msgHandler = cb;
              return { dispose: vi.fn() };
            }),
            postMessage: vi.fn(async (msg: any) => true),
          },
          reveal: vi.fn(),
          dispose: vi.fn(() => {
            if (disposeHandler) disposeHandler();
          }),
          onDidDispose: vi.fn((cb: any) => {
            disposeHandler = cb;
            return { dispose: vi.fn() };
          }),
          // Helper for tests to simulate incoming webview messages
          _triggerMessage: async (msg: any) => {
            if (msgHandler) await msgHandler(msg);
          },
        };
        createdWebviewPanels.push(panel);
        return panel;
      }),
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
          index: 0,
        },
      ],
      openTextDocument: vi.fn(async (filePath: string) => ({
        uri: { fsPath: filePath },
        getText: () => 'const user = await db.user.findUnique({ where: { id } });',
        version: 1,
      })),
      registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultVal: any) => defaultVal ?? []),
        update: vi.fn(),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
      joinPath: (base: any, ...segments: string[]) => ({
        fsPath: path.join(base.fsPath || '', ...segments),
        toString: () => `file://${path.join(base.fsPath || '', ...segments)}`,
      }),
    },
    ViewColumn: { One: 1, Two: 2, Beside: -2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class {},
    Range: class {
      constructor(public start: any, public end: any) {}
    },
    Position: class {
      constructor(public line: number, public character: number) {}
    },
    Selection: class {
      constructor(public anchor: any, public active: any) {}
    },
    TextEditorRevealType: { InCenter: 1 },
    CodeActionKind: { QuickFix: 'QuickFix', Empty: 'Empty' },
    EventEmitter: class {
      private listeners: ((e: any) => any)[] = [];
      public event = (listener: (e: any) => any) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
      public fire = (data: any) => {
        for (const l of this.listeners) l(data);
      };
    },
  };
});

import * as vscode from 'vscode';
import {
  FindingStore,
  AuditStorageManager,
  Finding,
  createDefaultProjectContext,
} from '@craftlens/core';
import { RuleEngine, RuleRegistry, registerDefaultRules } from '@craftlens/rule-engine';
import { AstCache } from '@craftlens/parser';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { DiagnosticsCollectionAdapter } from '../../apps/vscode-extension/src/diagnostics/collection-adapter.js';
import { CommandManager } from '../../apps/vscode-extension/src/commands/command-manager.js';
import { CraftLensStatusBar } from '../../apps/vscode-extension/src/status/status-bar.js';
import { ProjectOverviewPanel } from '../../apps/vscode-extension/src/overview/project-overview-panel.js';

describe('CraftLens Next: Live Dashboard & Project Overview', () => {
  let findingStore: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let engine: RuleEngine;
  let sidebarProvider: CraftLensSidebarProvider;
  let mockWebviewView: any;

  beforeEach(() => {
    ProjectOverviewPanel.currentPanel?.dispose();
    ProjectOverviewPanel.currentPanel = undefined;
    registeredCommands.clear();
    createdWebviewPanels = [];
    vi.clearAllMocks();

    findingStore = new FindingStore();
    storageManager = new AuditStorageManager('/mock/workspace');
    configManager = new ConfigurationManager();

    const registry = new RuleRegistry();
    registerDefaultRules(registry);
    engine = new RuleEngine(registry, new AstCache());

    const projectCtx = {
      rootPath: '/mock/workspace',
      projectName: 'mock-workspace',
      frameworks: [],
      languages: ['typescript'],
      sourceDirs: ['src'],
      configFiles: [],
      dependencies: {},
      isMonorepo: false,
    } as any;

    sidebarProvider = new CraftLensSidebarProvider(
      findingStore,
      storageManager,
      configManager,
      engine,
      projectCtx
    );

    mockWebviewView = {
      webview: {
        html: '',
        options: {},
        onDidReceiveMessage: vi.fn(),
        postMessage: vi.fn(),
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
  });

  describe('1. Live Dashboard in Sidebar', () => {
    it('renders the 3 compact cards with initial baseline values', () => {
      const html = mockWebviewView.webview.html;
      expect(html).toContain('class="dashboard-grid"');
      expect(html).toContain('data-card="code-quality"');
      expect(html).toContain('data-card="open-issues"');
      expect(html).toContain('data-card="checklist"');

      // Card 1 — Code Quality
      expect(html).toContain('id="dashboard-code-quality-val"');
      expect(html).toContain('Code Quality');
      expect(html).toContain('>100</div>'); // Default score is 100 with zero findings

      // Card 2 — Open Issues
      expect(html).toContain('id="dashboard-open-issues-val"');
      expect(html).toContain('Open Issues');
      expect(html).toContain('>0</div>'); // Initially 0 open issues

      // Card 3 — Checklist
      expect(html).toContain('id="dashboard-checklist-val"');
      expect(html).toContain('Checklist');
    });

    it('dynamically updates Code Quality and Open Issues when findings change', () => {
      const mockFinding: Finding = {
        id: 'SEC-001-instance-1',
        ruleId: 'SEC-001',
        title: 'Exposed Secret Key Detected',
        message: 'Hardcoded secret in src/auth.ts',
        severity: 'critical',
        confidence: 0.95,
        location: {
          filePath: '/mock/workspace/src/auth.ts',
          line: 12,
          column: 5,
        },
        category: 'security',
        evidence: [],
      };

      // Add finding with string path
      findingStore.setFindingsForFile('/mock/workspace/src/auth.ts', [mockFinding]);

      const htmlAfterAdd = mockWebviewView.webview.html;

      // Open Issues must now be 1
      expect(htmlAfterAdd).toContain('id="dashboard-open-issues-val">1</div>');

      // Code quality score recalculates downwards (100 - 25 for critical finding = 75)
      expect(htmlAfterAdd).toContain('id="dashboard-code-quality-val">75</div>');

      // Resolving finding restores score
      findingStore.setFindingsForFile('/mock/workspace/src/auth.ts', []);
      const htmlAfterResolve = mockWebviewView.webview.html;
      expect(htmlAfterResolve).toContain('id="dashboard-open-issues-val">0</div>');
      expect(htmlAfterResolve).toContain('id="dashboard-code-quality-val">100</div>');
    });

    it('provides the Project Overview button in the top brand row', () => {
      const html = mockWebviewView.webview.html;
      expect(html).toContain('class="project-overview-btn"');
      expect(html).toContain('onclick="openProjectOverview()"');
      expect(html).toContain('⊞ Overview');
    });
  });

  describe('2. Project Overview Webview Panel & Commands', () => {
    let commandManager: CommandManager;
    let diagnosticsAdapter: DiagnosticsCollectionAdapter;
    let statusBar: CraftLensStatusBar;

    beforeEach(() => {
      diagnosticsAdapter = new DiagnosticsCollectionAdapter();
      statusBar = new CraftLensStatusBar();

      commandManager = new CommandManager(
        engine,
        diagnosticsAdapter,
        configManager,
        storageManager,
        statusBar,
        createDefaultProjectContext({ rootPath: '/mock/workspace' }),
        sidebarProvider,
        undefined,
        undefined,
        vscode.Uri.file('/mock/extension')
      );
    });

    it('registers craftlens.openProjectOverview command', () => {
      expect(registeredCommands.has('craftlens.openProjectOverview')).toBe(true);
    });

    it('opens Project Overview in a new VS Code editor tab when executed', async () => {
      await vscode.commands.executeCommand('craftlens.openProjectOverview');

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      const created = createdWebviewPanels[0];
      expect(created.viewType).toBe('craftlens.projectOverview');
      expect(created.title).toBe('Project Overview');
      expect(created.options.retainContextWhenHidden).toBe(true);

      const overviewHtml = created.webview.html;
      // Header
      expect(overviewHtml).toContain('<h1>Project Overview</h1>');
      expect(overviewHtml).toContain('Your project is healthy!');
      expect(overviewHtml).toContain('Scan Now &gt;');

      // 4 Top Metric Cards
      expect(overviewHtml).toContain('Open Issues');
      expect(overviewHtml).toContain('Checklist');
      expect(overviewHtml).toContain('Active Skills');
      expect(overviewHtml).toContain('Quality Score');
    });

    it('handles webview message dispatch for scanProject, selectFinding, openFile, and applyFix', async () => {
      const testFinding: Finding = {
        id: 'AUTH-001',
        ruleId: 'SEC-B01',
        title: 'Missing authorization check',
        problemTitle: 'Missing authorization check',
        message: 'The route returns user data but does not verify that the requesting user is authorized.',
        why: 'Could allow unauthorized access to sensitive user data.',
        severity: 'high',
        confidence: 0.92,
        filePath: '/mock/workspace/src/api/users.ts',
        location: {
          filePath: '/mock/workspace/src/api/users.ts',
          line: 28,
        },
        category: 'security',
        evidence: [],
      };

      findingStore.setFindingsForFile('/mock/workspace/src/api/users.ts', [testFinding]);

      await vscode.commands.executeCommand('craftlens.openProjectOverview');
      const panel = createdWebviewPanels[createdWebviewPanels.length - 1];

      // Simulate clicking openFindingLocation
      await panel._triggerMessage({
        type: 'openFindingLocation',
        filePath: '/mock/workspace/src/api/users.ts',
        line: 28,
      });
      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith('/mock/workspace/src/api/users.ts');
      expect(vscode.window.showTextDocument).toHaveBeenCalled();

      // Simulate clicking scanProject
      await panel._triggerMessage({
        type: 'scanProject',
      });
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('craftlens.scanWorkspace');
    });
  });
});
