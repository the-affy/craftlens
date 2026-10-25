import { describe, it, expect, beforeEach, vi } from 'vitest';

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
      public fire = (data: any) => {
        for (const l of this.listeners) l(data);
      };
    },
  };
});

import {
  FindingStore,
  AuditStorageManager,
  ProjectContext,
  createDefaultProjectContext,
} from '@craftlens/core';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { RuleRegistry, registerDefaultRules, RuleEngine } from '@craftlens/rule-engine';

describe('VS Code Extension: Skill Manager UI & Rule Explorer Integration (Sections 5, 28, 29, 30)', () => {
  let findingStore: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let ruleRegistry: RuleRegistry;
  let engine: RuleEngine;
  let sidebarProvider: CraftLensSidebarProvider;

  beforeEach(() => {
    findingStore = new FindingStore();
    storageManager = new AuditStorageManager('/mock/workspace');
    configManager = new ConfigurationManager();

    ruleRegistry = new RuleRegistry();
    registerDefaultRules(ruleRegistry);
    engine = new RuleEngine(ruleRegistry);

    sidebarProvider = new CraftLensSidebarProvider(
      findingStore,
      storageManager,
      configManager,
      engine
    );
  });

  it('Requirement 28 & 30: renders tab switcher with Audit, Skills, and Rules tabs', () => {
    let renderedHtml = '';
    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
        postMessage: async () => true,
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(renderedHtml).toContain('ISSUES');
    expect(renderedHtml).toContain('SKILLS');
    expect(renderedHtml).toContain('RULES');
    expect(renderedHtml).toContain('AUDIT');
  });

  it('Requirement 5: renders three global rule execution modes (CraftLens, User Only, Combined)', () => {
    let renderedHtml = '';
    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(renderedHtml).toContain('Rule Sources');
    expect(renderedHtml).toContain('CraftLens');
    expect(renderedHtml).toContain('User Only');
    expect(renderedHtml).toContain('Combined');
  });

  it('Requirement 28: renders built-in skills in the Skills tab', () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Switch to Skills tab
    messageHandler?.({ type: 'switchTab', tab: 'skills' });

    expect(renderedHtml).toContain('BUILT-IN');
    expect(renderedHtml).toContain('CraftLens Core');
    expect(renderedHtml).toContain('Product/UI Intelligence');
    expect(renderedHtml).toContain('Anti-AI UI');
    expect(renderedHtml).toContain('UI/UX Intelligence');
    expect(renderedHtml).toContain('Component Reference');
    expect(renderedHtml).toContain('Accessibility');
    expect(renderedHtml).toContain('Security');
    expect(renderedHtml).toContain('+ Add Skill');
  });

  it('Requirement 30: renders rule explorer and categories in the Rules tab', () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Switch to Rules tab
    messageHandler?.({ type: 'switchTab', tab: 'rules' });

    expect(renderedHtml).toContain('Active Rules (');
    expect(renderedHtml).toContain('Search rules...');
    expect(renderedHtml).toContain('AP-008');
    expect(renderedHtml).toContain('UI-001');
    expect(renderedHtml).toContain('SEC-001');
  });

  it('renders Checklist tab with living verification criteria and checklist.md link', () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Switch to Checklist tab
    messageHandler?.({ type: 'switchTab', tab: 'checklist' });

    expect(renderedHtml).toContain('checklist-container');
    expect(renderedHtml).toContain('checklist-heading');
    expect(renderedHtml).toContain('View checklist.md');
    expect(renderedHtml).toContain('checklist-checkbox');
  });

  it('renders Metrics tab with health grade, audit level selector, and suppressions', () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Switch to Metrics tab
    messageHandler?.({ type: 'switchTab', tab: 'metrics' });

    expect(renderedHtml).toContain('Codebase Quality Health');
    expect(renderedHtml).toContain('Audit Rigor Level');
    expect(renderedHtml).toContain('EASY');
    expect(renderedHtml).toContain('MODERATE');
    expect(renderedHtml).toContain('HARD');
    expect(renderedHtml).toContain('STRICT');
    expect(renderedHtml).toContain('Auto-Audit on Save & Change');
  });

  it('supports filtering sidebar findings and active filter notification', () => {
    let renderedHtml = '';
    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Apply error filter
    sidebarProvider.setFilter('error');
    expect(sidebarProvider.getFilter()).toBe('error');
    expect(renderedHtml).toContain('Filter active:');
    expect(renderedHtml).toContain('ERROR');

    // Clear filter
    sidebarProvider.setFilter('all');
    expect(sidebarProvider.getFilter()).toBe('all');
    expect(renderedHtml).not.toContain('Filter active:');
  });

  it('Requirement 22 & Stability: webview script has valid syntax, diagnostic, and no unexpected tokens', async () => {
    let renderedHtml = '';
    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Verify script tag exists and has no syntax errors
    const scriptMatch = renderedHtml.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    const scriptContent = scriptMatch![1];

    // Validate that the script compiles cleanly without SyntaxError
    const vm = await import('node:vm');
    expect(() => {
      new vm.Script(scriptContent);
    }).not.toThrow();

    expect(scriptContent).toContain('window.switchTab');
    expect(scriptContent).toContain('window.runAudit');
    expect(scriptContent).toContain('window.toggleSkillCheckbox');
    expect(scriptContent).toContain('window.__craftlensDiagnostic');
  });

  it('Requirement 4 & 22: all 5 tabs (Audit, Checklist, Skills, Rules, Metrics) work independently and update active styling', () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // 1. Audit tab
    messageHandler?.({ type: 'switchTab', tab: 'audit' });
    expect(renderedHtml).toContain('nav-btn active" onclick="switchTab(\'audit\')"');
    expect(renderedHtml).toContain('No Quality Slop Detected');

    // 2. Checklist tab
    messageHandler?.({ type: 'switchTab', tab: 'checklist' });
    expect(renderedHtml).toContain('nav-btn active" onclick="switchTab(\'checklist\')"');
    expect(renderedHtml).toContain('checklist-container');

    // 3. Skills tab
    messageHandler?.({ type: 'switchTab', tab: 'skills' });
    expect(renderedHtml).toContain('nav-btn active" onclick="switchTab(\'skills\')"');
    expect(renderedHtml).toContain('BUILT-IN');

    // 4. Rules tab
    messageHandler?.({ type: 'switchTab', tab: 'rules' });
    expect(renderedHtml).toContain('nav-btn active" onclick="switchTab(\'rules\')"');
    expect(renderedHtml).toContain('Active Rules (');

    // 5. Metrics tab
    messageHandler?.({ type: 'switchTab', tab: 'metrics' });
    expect(renderedHtml).toContain('nav-btn active" onclick="switchTab(\'metrics\')"');
    expect(renderedHtml).toContain('Codebase Quality Health');
  });

  it('Requirement 11, 12 & 22: skill toggle, show more/less recommendations, and search work properly', async () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    messageHandler?.({ type: 'switchTab', tab: 'skills' });

    // Show more recommendations
    expect(renderedHtml).toContain('Show More');
    await messageHandler?.({ type: 'toggleShowMoreRecommendations' });
    expect(renderedHtml).toContain('Show Less');

    // Toggle back to Show less
    await messageHandler?.({ type: 'toggleShowMoreRecommendations' });
    expect(renderedHtml).toContain('Show More');

    // Search skills
    await messageHandler?.({ type: 'searchSkills', query: 'accessibility' });
    expect(renderedHtml).toContain('accessibility');
  });

  it('Requirement 13: removes round status dots from severity bar, filters, and finding cards', () => {
    let renderedHtml = '';
    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    // Add a finding to store
    findingStore.setFindingsForFile('/mock/file.css', [{
      id: 'test-finding-1',
      ruleId: 'UI-006',
      title: 'Transition All Slop',
      severity: 'error',
      message: 'transition: all detected',
      category: 'ui-ux',
      location: { filePath: '/mock/file.css', start: { line: 12, column: 1, offset: 0 }, end: { line: 12, column: 15, offset: 14 } },
    } as any]);

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Verify round dots (🔴, 🟡, 🟠, ⚪) are NOT in the HTML
    expect(renderedHtml).not.toContain('🔴');
    expect(renderedHtml).not.toContain('🟡');
    expect(renderedHtml).not.toContain('🟠');
    expect(renderedHtml).not.toContain('⚪');

    // Verify status text and badges are clean without dots
    expect(renderedHtml).toContain('ERR 1');
    expect(renderedHtml).toContain('WARN 0');
    expect(renderedHtml).toContain('MOD 0');
    expect(renderedHtml).toContain('INFO 0');
    expect(renderedHtml).toContain('sev-badge error">ERROR<');
  });

  it('Requirement 1 & 2: Checklist title displays dynamic criteria count and renders checkbox rows', () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    // Verify dynamic count in nav tab
    const audit = storageManager.loadAudit();
    const count = audit?.items?.length || 0;
    expect(count).toBeGreaterThan(0);
    expect(renderedHtml).toContain(`CHECKLIST <span class="nav-count">${count}</span>`);

    // Switch to checklist tab
    messageHandler?.({ type: 'switchTab', tab: 'checklist' });

    // Section title count
    expect(renderedHtml).toContain('<span class="checklist-heading">Checklist</span>');
    expect(renderedHtml).toContain(`<span class="checklist-count-badge">${count}</span>`);

    // Individual checkboxes
    expect(renderedHtml).toContain('class="checklist-checkbox"');
    expect(renderedHtml).toContain('data-action="toggle-criterion"');
    expect(renderedHtml).toContain('View checklist.md');

    // No emojis
    expect(renderedHtml).not.toContain('☑');
    expect(renderedHtml).not.toContain('☐');
  });

  it('Requirement 4: manual toggleChecklistCriterion message updates storage and refreshes view', async () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const audit = storageManager.loadAudit();
    const firstItem = audit!.items[0];

    // Toggle criterion via message
    await messageHandler?.({
      type: 'toggleChecklistCriterion',
      id: firstItem.id,
      checked: true,
    });

    const updatedAudit = storageManager.loadAudit();
    const updatedItem = updatedAudit!.items.find(i => i.id === firstItem.id);
    expect(updatedItem?.checked).toBe(true);
    expect(updatedItem?.manualOverride).toBe(true);
  });

  it('Requirement 10, 11 & 12: Info, Remove, and Activate controls share uniform control height and no emojis', () => {
    let renderedHtml = '';
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: (handler: any) => {
          messageHandler = handler;
          return { dispose: () => {} };
        },
        set html(val: string) {
          renderedHtml = val;
        },
        get html() {
          return renderedHtml;
        },
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    messageHandler?.({ type: 'switchTab', tab: 'skills' });

    // Verify shared control height token
    expect(renderedHtml).toContain('--control-height: 24px;');
    expect(renderedHtml).toContain('min-height: var(--control-height, 24px);');

    // Verify info button styling and accessible label
    expect(renderedHtml).toContain('class="skill-icon-btn"');
    expect(renderedHtml).toContain('aria-label="View skill details"');
    expect(renderedHtml).toContain('<span aria-hidden="true">i</span>');

    // Verify no emojis in actions
    expect(renderedHtml).not.toContain('ℹ');
    expect(renderedHtml).not.toContain('✕');
  });
});


