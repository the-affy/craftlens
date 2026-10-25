import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
        clear: vi.fn(),
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
      openTextDocument: vi.fn(async (uri: any) => ({
        uri: typeof uri === 'string' ? { fsPath: uri } : uri,
        getText: () => 'class ServiceBox {}',
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
      parse: (s: string) => ({ toString: () => s }),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class {},
    Range: class {},
    Position: class {},
    Diagnostic: class {
      constructor(public range: any, public message: string, public severity: any) {}
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
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
  ProjectContext,
  createDefaultProjectContext,
} from '@craftlens/core';
import { RuleRegistry, RuleEngine } from '@craftlens/rule-engine';
import { AstCache } from '@craftlens/parser';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { DiagnosticsCollectionAdapter } from '../../apps/vscode-extension/src/diagnostics/collection-adapter.js';
import { CraftLensStatusBar } from '../../apps/vscode-extension/src/status/status-bar.js';
import { CommandManager } from '../../apps/vscode-extension/src/commands/command-manager.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { CraftLensDetailViewProvider } from '../../apps/vscode-extension/src/sidebar/detail-panel-provider.js';

describe('Runtime Event Handling & Icon Resilience', () => {
  let findingStore: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let diagnosticsAdapter: DiagnosticsCollectionAdapter;
  let engine: RuleEngine;
  let statusBar: CraftLensStatusBar;
  let commandManager: CommandManager;
  let sidebarProvider: CraftLensSidebarProvider;
  let detailPanelProvider: CraftLensDetailViewProvider;
  let projectContext: ProjectContext;

  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();

    findingStore = new FindingStore();
    storageManager = new AuditStorageManager('/mock/workspace');
    configManager = new ConfigurationManager();
    diagnosticsAdapter = new DiagnosticsCollectionAdapter();
    const registry = new RuleRegistry();
    const astCache = new AstCache();
    engine = new RuleEngine(registry, astCache);
    statusBar = new CraftLensStatusBar();
    projectContext = createDefaultProjectContext('/mock/workspace');

    sidebarProvider = new CraftLensSidebarProvider(
      findingStore,
      storageManager,
      configManager,
      engine,
      projectContext
    );

    detailPanelProvider = new CraftLensDetailViewProvider(
      vscode.Uri.file('/mock/extension'),
      engine.getSkillManager()
    );

    commandManager = new CommandManager(
      engine,
      diagnosticsAdapter,
      configManager,
      storageManager,
      statusBar,
      projectContext,
      sidebarProvider,
      detailPanelProvider
    );
  });

  describe('1. Icon Asset & Manifest Verification', () => {
    it('verifies that package.json references colored icon for Marketplace and craftlens.svg for Activity Bar', () => {
      const pkgPath = path.resolve(__dirname, '../../apps/vscode-extension/package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      // Marketplace colored icon
      expect(pkgJson.icon).toBe('resources/icon.png');

      // Activity Bar icon
      const activityBarContainers = pkgJson.contributes.viewsContainers.activitybar;
      expect(activityBarContainers[0].icon).toBe('media/icons/craftlens-sidebar.svg');

      // Detail Panel icon
      const panelContainers = pkgJson.contributes.viewsContainers.panel;
      expect(panelContainers[0].icon).toBe('media/icons/craftlens-sidebar.svg');

      // Verify craftlens.applyQuickFix is declared in contributes.commands
      const commands = pkgJson.contributes.commands;
      const applyQuickFixCmd = commands.find((c: any) => c.command === 'craftlens.applyQuickFix');
      expect(applyQuickFixCmd).toBeDefined();
      expect(applyQuickFixCmd.title).toContain('Apply Quick Fix');

      // Verify sidebar SVG reference
      const rawPkg = fs.readFileSync(pkgPath, 'utf-8');
      expect(rawPkg).toContain('craftlens-sidebar.svg');
    });

    it('verifies icon files exist on disk with valid headers and currentColor', () => {
      const colorIconPath = path.resolve(__dirname, '../../apps/vscode-extension/resources/icon.png');
      const sidebarSvgPath = path.resolve(__dirname, '../../apps/vscode-extension/media/icons/craftlens-sidebar.svg');
      const bwSvgPath = path.resolve(__dirname, '../../apps/vscode-extension/resources/craftlens.svg');
      const bwPngPath = path.resolve(__dirname, '../../apps/vscode-extension/resources/craftlens.png');
      const sidebarIconSvgPath = path.resolve(__dirname, '../../apps/vscode-extension/media/icons/craftlens-sidebar.svg');

      expect(fs.existsSync(colorIconPath)).toBe(true);
      expect(fs.existsSync(sidebarSvgPath)).toBe(true);
      expect(fs.existsSync(bwSvgPath)).toBe(true);
      expect(fs.existsSync(bwPngPath)).toBe(true);
      expect(fs.existsSync(sidebarIconSvgPath)).toBe(true);

      // Verify color icon is PNG
      const colorBuffer = fs.readFileSync(colorIconPath);
      expect(colorBuffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      // Verify sidebar SVG uses exact structure with currentColor
      const svgContent = fs.readFileSync(sidebarSvgPath, 'utf-8');
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('viewBox="0 0 512 512"');
      expect(svgContent).toContain('fill="currentColor"');
      expect(svgContent).toContain('d="M0 0h512v512H0z"');
      expect(svgContent).toContain('</svg>');
    });
  });

  describe('2. "add" Event & Webview Message Resilience in Sidebar', () => {
    it('gracefully handles { type: "add" } without throwing or crashing', async () => {
      let messageHandler: ((msg: any) => Promise<void>) | undefined;
      const mockWebviewView: any = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn((fn: any) => {
            messageHandler = fn;
            return { dispose: vi.fn() };
          }),
          html: '',
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      };

      sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
      expect(messageHandler).toBeDefined();

      // Trigger "add" event
      await expect(messageHandler!({ type: 'add' })).resolves.not.toThrow();

      // Trigger "add-skill"
      await expect(messageHandler!({ type: 'add-skill' })).resolves.not.toThrow();

      // Trigger "addSkill"
      await expect(messageHandler!({ type: 'addSkill' })).resolves.not.toThrow();

      // Trigger action: "add"
      await expect(messageHandler!({ action: 'add' })).resolves.not.toThrow();
    });

    it('handles { type: "add", skillId: "..." } and triggers install/activate safely', async () => {
      let messageHandler: ((msg: any) => Promise<void>) | undefined;
      const mockWebviewView: any = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn((fn: any) => {
            messageHandler = fn;
            return { dispose: vi.fn() };
          }),
          html: '',
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      };

      sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      // Trigger with explicit skillId
      await expect(
        messageHandler!({ type: 'add', skillId: 'craftlens-team-rules', active: true })
      ).resolves.not.toThrow();

      // Trigger with nested skill object
      await expect(
        messageHandler!({ type: 'add', skill: { id: 'nested-skill' } })
      ).resolves.not.toThrow();
    });

    it('handles malformed, null, undefined, and non-object messages gracefully without throwing', async () => {
      let messageHandler: ((msg: any) => Promise<void>) | undefined;
      const mockWebviewView: any = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn((fn: any) => {
            messageHandler = fn;
            return { dispose: vi.fn() };
          }),
          html: '',
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      };

      sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      // Send null
      await expect(messageHandler!(null)).resolves.not.toThrow();

      // Send undefined
      await expect(messageHandler!(undefined)).resolves.not.toThrow();

      // Send empty object
      await expect(messageHandler!({})).resolves.not.toThrow();

      // Send arbitrary string
      await expect(messageHandler!('random-event-string')).resolves.not.toThrow();

      // Send missing parameters for toggleSkill
      await expect(messageHandler!({ type: 'toggleSkill' })).resolves.not.toThrow();

      // Send missing parameters for deleteSkill
      await expect(messageHandler!({ type: 'deleteSkill', skillId: null })).resolves.not.toThrow();

      // Send missing parameters for openInstance
      await expect(messageHandler!({ type: 'openInstance' })).resolves.not.toThrow();
    });
  });

  describe('3. Detail Panel Event Handling Resilience', () => {
    it('handles "add" and "installSkill" events safely in detail panel', async () => {
      let messageHandler: ((msg: any) => Promise<void>) | undefined;
      const mockWebviewView: any = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn((fn: any) => {
            messageHandler = fn;
            return { dispose: vi.fn() };
          }),
          html: '',
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      };

      detailPanelProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
      expect(messageHandler).toBeDefined();

      // Test "add" in detail panel
      await expect(messageHandler!({ type: 'add' })).resolves.not.toThrow();
      await expect(messageHandler!({ type: 'addSkill' })).resolves.not.toThrow();

      // Test "installSkill" with object-shaped ID
      await expect(messageHandler!({ type: 'installSkill', skillId: { id: 'team-design' } })).resolves.not.toThrow();

      // Test malformed actions on empty finding
      await expect(messageHandler!({ type: 'applyFix' })).resolves.not.toThrow();
      await expect(messageHandler!({ type: 'previewFix' })).resolves.not.toThrow();
      await expect(messageHandler!({ type: 'openLocation' })).resolves.not.toThrow();
    });
  });

  describe('4. Lifecycle & Disposable Cleanup', () => {
    it('cleans up previous message listeners when webview is re-resolved or disposed', () => {
      const disposeSpy1 = vi.fn();
      const disposeSpy2 = vi.fn();

      const mockWebview1: any = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn(() => ({ dispose: disposeSpy1 })),
          html: '',
        },
        onDidDispose: vi.fn((fn: any) => ({ dispose: vi.fn() })),
      };

      const mockWebview2: any = {
        webview: {
          options: {},
          onDidReceiveMessage: vi.fn(() => ({ dispose: disposeSpy2 })),
          html: '',
        },
        onDidDispose: vi.fn((fn: any) => ({ dispose: vi.fn() })),
      };

      // First resolve
      sidebarProvider.resolveWebviewView(mockWebview1, {} as any, {} as any);
      expect(disposeSpy1).not.toHaveBeenCalled();

      // Second resolve (e.g. sidebar reopened/refreshed)
      sidebarProvider.resolveWebviewView(mockWebview2, {} as any, {} as any);
      // Previous view disposables should have been cleaned up
      expect(disposeSpy1).toHaveBeenCalled();

      // Final dispose
      sidebarProvider.dispose();
      expect(disposeSpy2).toHaveBeenCalled();
    });
  });

  describe('5. CommandManager Polymorphism and Error Safety', () => {
    it('craftlens.addSkill handles direct arguments safely', async () => {
      // Execute with null / undefined (should not throw, triggers quick pick)
      await expect(vscode.commands.executeCommand('craftlens.addSkill')).resolves.not.toThrow();

      // Execute with object { skillId: '...' }
      await expect(vscode.commands.executeCommand('craftlens.addSkill', { skillId: 'foo' })).resolves.not.toThrow();

      // Execute with non-existent path
      await expect(vscode.commands.executeCommand('craftlens.addSkill', '/non/existent/file.md')).resolves.not.toThrow();
    });

    it('resolveFinding resolves findingId and id object patterns safely', () => {
      const mockFinding: any = {
        id: 'find-123',
        fingerprint: 'find-123',
        ruleId: 'UI-006',
        category: 'ui',
        filePath: '/mock/workspace/App.tsx',
        location: {
          filePath: '/mock/workspace/App.tsx',
          start: { line: 10, column: 1, offset: 0 },
          end: { line: 10, column: 20, offset: 0 },
        },
      };

      diagnosticsAdapter.update(vscode.Uri.file('/mock/workspace/App.tsx'), [mockFinding]);

      // Resolve via object with findingId
      const resolved1 = commandManager.resolveFinding({ findingId: 'find-123' });
      expect(resolved1).toBeDefined();
      expect(resolved1?.ruleId).toBe('UI-006');

      // Resolve via object with id
      const resolved2 = commandManager.resolveFinding({ id: 'find-123' });
      expect(resolved2).toBeDefined();
      expect(resolved2?.ruleId).toBe('UI-006');

      // Resolve with malformed object
      const resolved3 = commandManager.resolveFinding({ randomProp: true });
      expect(resolved3).toBeUndefined();
    });
  });
});
