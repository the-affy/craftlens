import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showOpenDialog: vi.fn(),
      showInputBox: vi.fn(),
      createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
    },
    commands: {
      executeCommand: vi.fn(),
      registerCommand: vi.fn(),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultVal: any) => defaultVal ?? []),
        update: vi.fn(),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
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
      public fire = (e: any) => {
        this.listeners.forEach(l => l(e));
      };
    },
    Uri: {
      file: vi.fn((p: string) => ({ fsPath: p, scheme: 'file' })),
      parse: vi.fn((p: string) => ({ fsPath: p, scheme: 'file' })),
    },
  };
});

import { UIAnalyzer } from '../../packages/design-intelligence/src/index.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { FindingStore, AuditStorageManager, calculateHealthScore } from '../../packages/core/src/index.js';
import { RuleRegistry, registerDefaultRules, RuleEngine } from '../../packages/rule-engine/src/index.js';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';

describe('CraftLens Self-Audit: Skills UI & Micro-UX', () => {
  it('Skills UI passes CraftLens UI/UX reasoning engine with zero critical/error slop findings', () => {
    const store = new FindingStore();
    const storage = new AuditStorageManager('/tmp/test-workspace');
    const configManager = new ConfigurationManager();
    const registry = new RuleRegistry();
    registerDefaultRules(registry);
    const engine = new RuleEngine(registry);

    const provider = new CraftLensSidebarProvider(
      store,
      storage,
      configManager,
      engine,
      { framework: 'vanilla-html', isInteractiveApp: true } as any
    );

    let renderedHtml = '';
    const mockWebview: any = {
      options: {},
      onDidReceiveMessage: () => ({ dispose: () => {} }),
      set html(val: string) {
        renderedHtml = val;
      },
      get html() {
        return renderedHtml;
      },
    };

    provider.resolveWebviewView({ webview: mockWebview } as any, {} as any, {} as any);
    (provider as any).activeTab = 'skills';
    (provider as any).updateHtml();

    // Verify rendered HTML is rich and structured
    expect(renderedHtml).toContain('BUILT-IN');
    expect(renderedHtml).toContain('MY SKILLS');
    expect(renderedHtml).toContain('INSTALLED');
    expect(renderedHtml).toContain('RECOMMENDED FOR THIS PROJECT');
    expect(renderedHtml).toContain('DISCOVER');

    // Run CraftLens UI reasoning engine on the rendered Skills HTML
    const report = UIAnalyzer.analyze('skills-panel.html', renderedHtml);

    // Filter blocker/error findings on the Skills UI
    const seriousFindings = report.findings.filter(
      f => f.severity === 'blocker' || f.severity === 'error'
    );

    const scoreResult = calculateHealthScore({
      passedChecks: 30,
      totalChecks: 30,
      errors: seriousFindings.length,
      warnings: report.findings.filter(f => f.severity === 'warning').length,
      suggestions: report.findings.filter(f => f.severity === 'suggestion').length,
    });

    expect(seriousFindings.length).toBe(0);
    expect(scoreResult.score).toBeGreaterThanOrEqual(95);
    expect(scoreResult.grade).not.toBe('Critical');
  });
});
