import { describe, it, vi } from 'vitest';

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
      createWebviewPanel: vi.fn(() => ({
        webview: { html: '', onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) },
        reveal: vi.fn(),
        dispose: vi.fn(),
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      })),
    },
    commands: {
      executeCommand: vi.fn(),
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock' }],
      getConfiguration: vi.fn(() => ({ get: vi.fn((k, d) => d), update: vi.fn() })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      openTextDocument: vi.fn(async () => ({})),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p }),
      joinPath: (base: any, ...seg: string[]) => ({ fsPath: [base.fsPath, ...seg].join('/') }),
    },
    ViewColumn: { One: 1 },
    EventEmitter: class {
      private listeners: ((e: any) => any)[] = [];
      public event = (listener: (e: any) => any) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
      public fire = (e: any) => {
        this.listeners.forEach(l => l(e));
      };
    },
  };
});
import * as vscode from 'vscode';
import { FindingStore, AuditStorageManager, createDefaultProjectContext } from '@craftlens/core';
import { RuleEngine, RuleRegistry, registerDefaultRules } from '@craftlens/rule-engine';
import { AstCache } from '@craftlens/parser';
import { UIAnalyzer } from '@craftlens/design-intelligence';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { ProjectOverviewPanel } from '../../apps/vscode-extension/src/overview/project-overview-panel.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { CraftLensDetailViewProvider } from '../../apps/vscode-extension/src/sidebar/detail-panel-provider.js';

describe('Self-Audit Inspection', () => {
  it('inspects findings on CraftLens extension UI HTML', async () => {
    const registry = new RuleRegistry();
    registerDefaultRules(registry);
    const engine = new RuleEngine(registry, new AstCache());
    const store = new FindingStore();
    const storage = new AuditStorageManager('/mock/workspace');
    const configManager = new ConfigurationManager();
    const ctx = createDefaultProjectContext('/mock/workspace');

    // 1. Overview Panel HTML
    const overviewPanel = ProjectOverviewPanel.createOrShow(
      { fsPath: '/mock/ext' } as any,
      store,
      storage,
      configManager,
      engine,
      ctx
    );
    const overviewHtml = overviewPanel.getHtml();

    const reportOverview = UIAnalyzer.analyze('/project-overview.html', overviewHtml);
    console.log('--- OVERVIEW PANEL UI FINDINGS ---');
    for (const f of reportOverview.findings) {
      console.log(`[${f.severity}] ${f.ruleId || (f as any).id}: ${f.message || f.problemTitle}`);
    }

    const engineReportOverview = engine.analyze({
      filePath: '/project-overview.html',
      sourceText: overviewHtml,
      config: configManager.getConfig(),
      projectContext: ctx,
    });
    console.log('--- OVERVIEW PANEL ENGINE FINDINGS ---');
    for (const f of engineReportOverview.findings) {
      console.log(`[${f.severity}] ${f.ruleId}: ${f.message} (${f.problemTitle || ''}) - snippet: ${f.evidence?.[0]?.snippet || ''}`);
    }

    // 2. Sidebar HTML
    const sidebar = new CraftLensSidebarProvider(store, storage, configManager, engine, ctx);
    let sidebarHtml = '';
    sidebar.resolveWebviewView({ webview: { options: {}, onDidReceiveMessage: () => ({ dispose: () => {} }), set html(v: string) { sidebarHtml = v; }, get html() { return sidebarHtml; } } } as any, {} as any, {} as any);
    
    const reportSidebar = UIAnalyzer.analyze('/sidebar.html', sidebarHtml);
    console.log('--- SIDEBAR UI FINDINGS ---');
    for (const f of reportSidebar.findings) {
      console.log(`[${f.severity}] ${f.ruleId || (f as any).id}: ${f.message || f.problemTitle}`);
    }

    const engineReportSidebar = engine.analyze({
      filePath: '/sidebar.html',
      sourceText: sidebarHtml,
      config: configManager.getConfig(),
      projectContext: ctx,
    });
    console.log('--- SIDEBAR ENGINE FINDINGS ---');
    for (const f of engineReportSidebar.findings) {
      console.log(`[${f.severity}] ${f.ruleId}: ${f.message} (${f.problemTitle || ''}) - snippet: ${f.evidence?.[0]?.snippet || ''}`);
    }

    // 3. Detail Panel HTML
    const detail = new CraftLensDetailViewProvider({ fsPath: '/mock/ext' } as any);
    (detail as any).showBetterDesign({ id: 'f-1', ruleId: 'CP-007', title: 'Repeated Card Treatment', severity: 'moderate' } as any, []);
    const detailHtml = (detail as any).renderHtml();
    const reportDetail = UIAnalyzer.analyze('/detail.html', detailHtml);
    const engineReportDetail = engine.analyze({
      filePath: '/detail.html',
      sourceText: detailHtml,
      config: configManager.getConfig(),
      projectContext: ctx,
    });
    const results = {
      overviewUI: reportOverview.findings.map(f => ({ id: f.ruleId || (f as any).id, sev: f.severity, msg: f.message })),
      overviewEngine: engineReportOverview.findings.map(f => ({ id: f.ruleId, sev: f.severity, msg: f.message, title: f.problemTitle })),
      sidebarUI: reportSidebar.findings.map(f => ({ id: f.ruleId || (f as any).id, sev: f.severity, msg: f.message })),
      sidebarEngine: engineReportSidebar.findings.map(f => ({ id: f.ruleId, sev: f.severity, msg: f.message, title: f.problemTitle })),
      detailUI: reportDetail.findings.map(f => ({ id: f.ruleId || (f as any).id, sev: f.severity, msg: f.message })),
      detailEngine: engineReportDetail.findings.map(f => ({ id: f.ruleId, sev: f.severity, msg: f.message, title: f.problemTitle })),
    };
    const fs = await import('node:fs');
    const path = await import('node:path');
    const scratchDir = path.resolve(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    fs.writeFileSync(path.join(scratchDir, 'self-audit-findings.json'), JSON.stringify(results, null, 2), 'utf-8');
  });
});
