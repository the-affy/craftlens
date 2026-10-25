import { describe, it, expect, beforeEach, vi } from 'vitest';

const registeredCommands = new Map<string, (...args: any[]) => any>();

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
      openTextDocument: vi.fn(async () => ({
        uri: { fsPath: '/mock/workspace/.craftlens/checklist.md' },
        getText: () => '# CraftLens Master Audit',
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
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class {},
    Range: class {},
    Position: class {},
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
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FindingStore,
  AuditStorageManager,
  ProjectContext,
  createDefaultProjectContext,
} from '@craftlens/core';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { CommandManager } from '../../apps/vscode-extension/src/commands/command-manager.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { DiagnosticsCollectionAdapter } from '../../apps/vscode-extension/src/diagnostics/collection-adapter.js';
import { CraftLensStatusBar } from '../../apps/vscode-extension/src/status/status-bar.js';
import { RuleRegistry, registerDefaultRules, RuleEngine } from '@craftlens/rule-engine';

describe('VS Code Extension: Command Registration & Execution', () => {
  let findingStore: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let ruleRegistry: RuleRegistry;
  let engine: RuleEngine;
  let sidebarProvider: CraftLensSidebarProvider;
  let diagnosticsAdapter: DiagnosticsCollectionAdapter;
  let statusBar: CraftLensStatusBar;
  let commandManager: CommandManager;
  let projectContext: ProjectContext;

  beforeEach(() => {
    registeredCommands.clear();
    findingStore = new FindingStore();
    const tempRoot = path.join(process.cwd(), 'dist', 'test-workspace-' + Math.random().toString(36).substring(7));
    fs.mkdirSync(path.join(tempRoot, '.craftlens'), { recursive: true });

    storageManager = new AuditStorageManager(tempRoot);
    configManager = new ConfigurationManager();
    ruleRegistry = new RuleRegistry();
    registerDefaultRules(ruleRegistry);
    engine = new RuleEngine(ruleRegistry);
    sidebarProvider = new CraftLensSidebarProvider(findingStore, storageManager, configManager, engine);
    diagnosticsAdapter = new DiagnosticsCollectionAdapter(findingStore);
    statusBar = new CraftLensStatusBar();
    projectContext = createDefaultProjectContext(tempRoot);

    commandManager = new CommandManager(
      engine,
      diagnosticsAdapter,
      configManager,
      storageManager,
      statusBar,
      projectContext,
      sidebarProvider
    );
  });

  it('registers craftlens.openMasterChecklist and successfully opens checklist.md', async () => {
    expect(registeredCommands.has('craftlens.openMasterChecklist')).toBe(true);

    const handler = registeredCommands.get('craftlens.openMasterChecklist')!;
    await handler();

    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  it('registers craftlens.filterSidebar and applies chosen filter to sidebar', async () => {
    expect(registeredCommands.has('craftlens.filterSidebar')).toBe(true);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: 'Errors Only',
      value: 'error',
    } as any);

    const handler = registeredCommands.get('craftlens.filterSidebar')!;
    await handler();

    expect(sidebarProvider.getFilter()).toBe('error');
  });

  it('registers craftlens.clearSidebarFilter and resets sidebar filter to all', async () => {
    expect(registeredCommands.has('craftlens.clearSidebarFilter')).toBe(true);

    sidebarProvider.setFilter('warning');
    expect(sidebarProvider.getFilter()).toBe('warning');

    const handler = registeredCommands.get('craftlens.clearSidebarFilter')!;
    await handler();

    expect(sidebarProvider.getFilter()).toBe('all');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Filter cleared')
    );
  });

  it('registers craftlens.markNotAProblem and updates workspace suppressions', async () => {
    expect(registeredCommands.has('craftlens.markNotAProblem')).toBe(true);

    const fakeFinding = {
      ruleId: 'UI-004',
      message: 'Pill button overuse',
      severity: 'warning',
      location: { filePath: '/test.tsx', start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 5, offset: 5 } },
    };

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: 'Intentional design decision',
      reason: 'intentional_design',
    } as any);

    const handler = registeredCommands.get('craftlens.markNotAProblem')!;
    await handler(fakeFinding);

    const suppressions = storageManager.loadSuppressions();
    expect(suppressions).toContain('UI-004');
  });

  it('registers craftlens.showHealthBreakdown and displays summary status', async () => {
    expect(registeredCommands.has('craftlens.showHealthBreakdown')).toBe(true);

    // Save a mock audit
    storageManager.saveAudit({
      projectName: 'test-proj',
      lastAudit: Date.now(),
      auditLevel: 'moderate',
      summary: {
        total: 10,
        passed: 9,
        errors: 0,
        warnings: 1,
        suggestions: 0,
        healthScore: 90,
        healthGrade: 'A',
        passPercentage: 90,
      },
      groups: [],
      items: [],
    });

    const handler = registeredCommands.get('craftlens.showHealthBreakdown')!;
    await handler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Health Score: 90/100 (A)')
    );
  });

  it('Requirement 5: craftlens.openFindingLocation handles undefined or missing locations defensively without throwing', async () => {
    expect(registeredCommands.has('craftlens.openFindingLocation')).toBe(true);
    const handler = registeredCommands.get('craftlens.openFindingLocation')!;

    // 1. Calling with undefined target
    await expect(handler(undefined)).resolves.not.toThrow();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Location unavailable'),
      'Refresh analysis'
    );

    // 2. Calling with target lacking filePath
    await expect(handler({ line: 10 })).resolves.not.toThrow();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Location unavailable'),
      'Refresh analysis'
    );

    // 3. Calling with non-existent file path
    await expect(handler({ filePath: '/non/existent/path/Component.tsx', line: 5 })).resolves.not.toThrow();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Location unavailable'),
      'Refresh analysis'
    );
  });

  it('Requirement 7 & 8: craftlens.openMasterChecklist opens single Markdown source editor without duplicate preview', async () => {
    expect(registeredCommands.has('craftlens.openMasterChecklist')).toBe(true);
    const handler = registeredCommands.get('craftlens.openMasterChecklist')!;

    await handler();

    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ preview: false })
    );
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'markdown.showPreviewToSide',
      expect.anything()
    );
  });
});

