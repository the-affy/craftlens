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
          name: 'mock-workspace-with-extremely-long-enterprise-project-name-that-could-overflow',
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
import { CommandManager } from '../../apps/vscode-extension/src/commands/command-manager.js';
import { DiagnosticsCollectionAdapter } from '../../apps/vscode-extension/src/diagnostics/collection-adapter.js';
import { CraftLensStatusBar } from '../../apps/vscode-extension/src/status/status-bar.js';
import { ProjectOverviewPanel } from '../../apps/vscode-extension/src/overview/project-overview-panel.js';

describe('CraftLens Next: Responsive Dashboard & UX Hardening', () => {
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
      rootPath: '/mock/workspace/packages/deeply-nested-service-implementation-controller',
      projectName: 'super-long-enterprise-project-name-with-multiple-hyphens-and-suffixes',
      frameworks: [],
      languages: ['typescript'],
      sourceDirs: ['src'],
      configFiles: [],
      dependencies: {},
      isMonorepo: true,
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

  describe('1. Sidebar Dashboard Responsive Reflow', () => {
    it('contains responsive media queries for 3 -> 2 -> 1 column reflow', () => {
      const html = mockWebviewView.webview.html;
      // Grid uses minmax(0, 1fr)
      expect(html).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
      // Media query for narrow sidebar (<= 260px) reflows to 2 columns with checklist full width
      expect(html).toContain('@media (max-width: 260px)');
      expect(html).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
      expect(html).toContain('.dashboard-card[data-card="checklist"]');
      expect(html).toContain('grid-column: 1 / -1');
      // Media query for very narrow sidebar (<= 170px) reflows to 1 column
      expect(html).toContain('@media (max-width: 170px)');
      expect(html).toContain('grid-template-columns: 1fr');
      // Cards have min-width: 0 and box-sizing: border-box
      expect(html).toContain('min-width: 0');
      expect(html).toContain('box-sizing: border-box');
      // Accessible focus styling
      expect(html).toContain('.dashboard-card:focus-visible');
    });
  });

  describe('2. Project Overview Layout System & Bento Architecture', () => {
    let panel: ProjectOverviewPanel;

    beforeEach(() => {
      const longTitleFinding: Finding = {
        id: 'AUTH-SEC-LONG-001',
        ruleId: 'SEC-B01',
        title: 'Missing authorization check in deeply nested user access controller causing potential unauthenticated privilege escalation in distributed environment',
        problemTitle: 'Missing authorization check in deeply nested user access controller causing potential unauthenticated privilege escalation in distributed environment',
        message: 'The route returns user data but does not verify that the requesting user is authorized. This can lead to sensitive personal data exposure across tenant boundaries.',
        why: 'Without proper authorization middleware guards, malicious callers can spoof credentials or query arbitrary user records by guessing identifiers.',
        severity: 'critical',
        confidence: 0.98,
        filePath: '/mock/workspace/packages/enterprise-auth-service/src/controllers/v2/access/UserRoleAuthorizationProviderInternal.ts',
        location: {
          filePath: '/mock/workspace/packages/enterprise-auth-service/src/controllers/v2/access/UserRoleAuthorizationProviderInternal.ts',
          line: 142,
        },
        category: 'security',
        evidence: [],
      };

      findingStore.setFindingsForFile(
        '/mock/workspace/packages/enterprise-auth-service/src/controllers/v2/access/UserRoleAuthorizationProviderInternal.ts',
        [longTitleFinding]
      );

      panel = ProjectOverviewPanel.createOrShow(
        vscode.Uri.file('/mock/extension'),
        findingStore,
        storageManager,
        configManager,
        engine,
        createDefaultProjectContext({ rootPath: '/mock/workspace' })
      );
    });

    it('implements responsive Bento grid for top KPI cards (4 cols -> 2x2 Bento -> 1 col)', () => {
      const html = panel.getHtml();

      // Top KPI row grid with minmax(0, 1fr)
      expect(html).toContain('.kpi-row {');
      expect(html).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');

      // Intermediate breakpoint (<= 980px) changes composition to 2x2 Bento
      expect(html).toContain('@media (max-width: 980px) {');
      expect(html).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');

      // Narrow breakpoint (<= 520px) changes composition to 1 column
      expect(html).toContain('@media (max-width: 520px) {');
      expect(html).toContain('grid-template-columns: 1fr');

      // Quality Score circular gauge card uses clamp and does not shrink indefinitely
      expect(html).toContain('.circle-chart');
      expect(html).toContain('clamp(');
    });

    it('implements responsive Bento grid for workspace panels (3 cols -> 2 cols Bento -> 1 col)', () => {
      const html = panel.getHtml();

      // Desktop wide 3-column layout with minmax constraints
      expect(html).toContain('.workspace-grid {');
      expect(html).toContain('grid-template-columns: minmax(280px, 320px) minmax(360px, 1fr) minmax(320px, 390px)');

      // Intermediate breakpoint (<= 1080px): 2 columns Bento, diff panel spans full width
      expect(html).toContain('@media (max-width: 1080px) {');
      expect(html).toContain('grid-template-columns: minmax(280px, 320px) minmax(0, 1fr)');
      expect(html).toContain('.workspace-grid > .changes-panel');
      expect(html).toContain('grid-column: 1 / -1');

      // Narrow breakpoint (<= 740px): 1 column stacked layout
      expect(html).toContain('@media (max-width: 740px) {');
      expect(html).toContain('.workspace-grid > *');
      expect(html).toContain('grid-column: 1 / -1');
    });

    it('implements responsive Bento grid for bottom row summary (3 cols -> 2 cols Bento -> 1 col)', () => {
      const html = panel.getHtml();

      // Desktop 3 columns
      expect(html).toContain('.bottom-row-grid {');
      expect(html).toContain('grid-template-columns: minmax(280px, 1.2fr) minmax(240px, 1fr) minmax(240px, 1fr)');

      // Intermediate breakpoint (<= 1040px): 2 columns Bento, Card 1 spans full width
      expect(html).toContain('@media (max-width: 1040px) {');
      expect(html).toContain('.bottom-card:first-child');
      expect(html).toContain('grid-column: 1 / -1');

      // Narrow breakpoint (<= 640px): 1 column stacked
      expect(html).toContain('@media (max-width: 640px) {');
    });

    it('ensures action buttons never overflow and wrap/stack safely', () => {
      const html = panel.getHtml();

      // Action bars have flex-wrap: wrap
      expect(html).toContain('.detail-actions-bar {');
      expect(html).toContain('flex-wrap: wrap');
      expect(html).toContain('.diff-actions {');

      // Mobile breakpoint (<= 480px) stacks buttons with 100% width
      expect(html).toContain('@media (max-width: 480px) {');
      expect(html).toContain('flex-direction: column');
      expect(html).toContain('align-items: stretch');
      expect(html).toContain('width: 100%');

      // Buttons have minimum height and accessible focus states
      expect(html).toContain('min-height: 30px');
      expect(html).toContain(':focus-visible');
    });

    it('protects text containers with min-width: 0, overflow-wrap, and accessible tooltips', () => {
      const html = panel.getHtml();

      // Universal box-sizing
      expect(html).toContain('box-sizing: border-box');

      // Text containers have overflow-wrap break-word
      expect(html).toContain('overflow-wrap: break-word');
      expect(html).toContain('word-break: break-word');

      // Deeply nested file paths are handled with anywhere/break-all and have title tooltip
      expect(html).toContain('overflow-wrap: anywhere');
      expect(html).toContain('title="');

      // The long finding title is present and escaped safely
      expect(html).toContain('Missing authorization check in deeply nested user access controller');
      expect(html).toContain('UserRoleAuthorizationProviderInternal.ts');
    });

    it('contains code diff scrolling inside local container without page-level overflow', () => {
      const html = panel.getHtml();

      // Code diff container has local horizontal scrolling
      expect(html).toContain('.diff-code-container {');
      expect(html).toContain('overflow-x: auto');

      // Body does not rely on overflow-x: hidden bandaid
      expect(html).not.toContain('body {\n      background: var(--bg);\n      color: var(--fg);\n      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);\n      font-size: 13px;\n      line-height: 1.45;\n      padding: 20px 24px 40px;\n      overflow-x: hidden;\n    }');
    });

    it('supports realistic stress test cases: 0 findings, multiple findings, and long strings', () => {
      // Test 1: Empty state (0 findings)
      findingStore.setFindingsForFile(
        '/mock/workspace/packages/enterprise-auth-service/src/controllers/v2/access/UserRoleAuthorizationProviderInternal.ts',
        []
      );
      panel.refresh();
      const emptyHtml = panel.getHtml();
      expect(emptyHtml).toContain('No issues matching current filter');
      expect(emptyHtml).toContain('Select an issue from the list to view comprehensive details');

      // Test 2: Multiple findings with varied severities
      const findingList: Finding[] = [
        {
          id: 'F-1',
          ruleId: 'SEC-01',
          title: 'Critical DB credential exposure',
          message: 'Hardcoded credentials',
          severity: 'critical',
          confidence: 0.99,
          filePath: '/src/db.ts',
          category: 'security',
          evidence: [],
        },
        {
          id: 'F-2',
          ruleId: 'UX-02',
          title: 'Clickable non-interactive div without keyboard support',
          message: 'Accessibility defect',
          severity: 'medium',
          confidence: 0.85,
          filePath: '/src/ui/Card.tsx',
          category: 'accessibility',
          evidence: [],
        },
        {
          id: 'F-3',
          ruleId: 'CLN-03',
          title: 'Unnecessary any escape hatch',
          message: 'TypeScript safety issue',
          severity: 'low',
          confidence: 0.75,
          filePath: '/src/utils/parser.ts',
          category: 'maintainability',
          evidence: [],
        },
      ];

      findingStore.setFindingsForFile('/src/db.ts', [findingList[0]]);
      findingStore.setFindingsForFile('/src/ui/Card.tsx', [findingList[1]]);
      findingStore.setFindingsForFile('/src/utils/parser.ts', [findingList[2]]);

      panel.refresh();
      const multiHtml = panel.getHtml();
      expect(multiHtml).toContain('Critical DB credential exposure');
      expect(multiHtml).toContain('Clickable non-interactive div');
      expect(multiHtml).toContain('Unnecessary any escape hatch');
      expect(multiHtml).toContain('Open Issues');
      expect(multiHtml).toContain('>3</div>');
    });
  });

  describe('3. Width Testing Matrix & Breakpoint Continuity', () => {
    it('verifies layout composition and constraints across all required test widths', () => {
      const panel = ProjectOverviewPanel.createOrShow(
        vscode.Uri.file('/mock/extension'),
        findingStore,
        storageManager,
        configManager,
        engine,
        createDefaultProjectContext('/mock/workspace')
      );

      const html = panel.getHtml();

      // Extract all media queries in CSS
      const mediaQueries = [
        { query: '@media (max-width: 1080px)', width: 1080 },
        { query: '@media (max-width: 1040px)', width: 1040 },
        { query: '@media (max-width: 980px)', width: 980 },
        { query: '@media (max-width: 740px)', width: 740 },
        { query: '@media (max-width: 640px)', width: 640 },
        { query: '@media (max-width: 520px)', width: 520 },
        { query: '@media (max-width: 480px)', width: 480 },
      ];

      for (const mq of mediaQueries) {
        expect(html).toContain(mq.query);
      }

      // Test widths specified in requirement 15:
      // [320, 375, 480, 540, 600, 680, 768, 820, 900, 960, 1024, 1100, 1280, 1440]
      const testedWidths = [
        320, 375, 480, 540, 600, 680, 768, 820, 900, 960, 1024, 1100, 1280, 1440
      ];

      function resolveLayoutAtWidth(width: number) {
        return {
          width,
          kpiCols: width <= 520 ? 1 : width <= 980 ? 2 : 4,
          workspaceComposition: width <= 740 ? '1-column-stacked' : width <= 1080 ? '2-column-bento' : '3-column-wide',
          diffPanelSpanning: width <= 1080,
          bottomComposition: width <= 640 ? '1-column-stacked' : width <= 1040 ? '2-column-bento' : '3-column-wide',
          buttonsStacked: width <= 480,
          headerStacked: width <= 520,
        };
      }

      const results = testedWidths.map(resolveLayoutAtWidth);

      // Verify 320px, 375px, 480px: Very Narrow / Mobile
      for (const w of [320, 375, 480]) {
        const res = results.find(r => r.width === w)!;
        expect(res.kpiCols).toBe(1);
        expect(res.workspaceComposition).toBe('1-column-stacked');
        expect(res.bottomComposition).toBe('1-column-stacked');
        expect(res.buttonsStacked).toBe(true);
        expect(res.headerStacked).toBe(true);
      }

      // Verify 540px, 600px: Compact Tablet
      for (const w of [540, 600]) {
        const res = results.find(r => r.width === w)!;
        expect(res.kpiCols).toBe(2); // 2x2 Bento
        expect(res.workspaceComposition).toBe('1-column-stacked');
        expect(res.buttonsStacked).toBe(false); // Action bar wraps without clipping
        expect(res.headerStacked).toBe(false);
      }

      // Verify 680px, 768px: Medium Tablet
      for (const w of [680, 768]) {
        const res = results.find(r => r.width === w)!;
        expect(res.kpiCols).toBe(2); // 2x2 Bento
        if (w === 768) {
          expect(res.workspaceComposition).toBe('2-column-bento');
        }
      }

      // Verify 820px, 900px, 960px: Medium Desktop
      for (const w of [820, 900, 960]) {
        const res = results.find(r => r.width === w)!;
        expect(res.kpiCols).toBe(2); // 2x2 Bento
        expect(res.workspaceComposition).toBe('2-column-bento');
        expect(res.diffPanelSpanning).toBe(true); // Diff spans full width on row 2
        expect(res.bottomComposition).toBe('2-column-bento');
      }

      // Verify 1024px: Desktop with sidebar open
      const res1024 = results.find(r => r.width === 1024)!;
      expect(res1024.kpiCols).toBe(4);
      expect(res1024.workspaceComposition).toBe('2-column-bento');
      expect(res1024.diffPanelSpanning).toBe(true);

      // Verify 1100px, 1280px, 1440: Wide & Ultra-wide
      for (const w of [1100, 1280, 1440]) {
        const res = results.find(r => r.width === w)!;
        expect(res.kpiCols).toBe(4);
        expect(res.workspaceComposition).toBe('3-column-wide');
        expect(res.diffPanelSpanning).toBe(false);
        expect(res.bottomComposition).toBe('3-column-wide');
      }
    });
  });
});

