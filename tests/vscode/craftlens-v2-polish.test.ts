import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file', toString: () => `file://${p}` }),
    },
    ThemeColor: class {
      constructor(public id: string) {}
    },
    Range: class {
      constructor(public start: any, public end: any) {}
    },
    Position: class {
      constructor(public line: number, public character: number) {}
    },
    CodeLens: class {
      constructor(public range: any, public command?: any) {}
    },
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
  createLocation,
  createDefaultProjectContext,
  toSemanticSeverity,
  SEMANTIC_SEVERITY_MAP,
  ContextAwareFixGenerator,
} from '@craftlens/core';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { CraftLensCodeLensProvider } from '../../apps/vscode-extension/src/codelens/codelens-provider.js';
import { DIAGNOSTIC_DESIGN_TOKENS } from '../../apps/vscode-extension/src/decorations/inline-decorations.js';

describe('CraftLens V2 — Finding UX, Fix Restoration & Sidebar Command Polish', () => {
  const testWorkspace = path.resolve(__dirname, '../fixtures/craftlens-v2-workspace');
  let findingStore: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let sidebarProvider: CraftLensSidebarProvider;
  let mockWebviewView: any;
  let messageHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    if (!fs.existsSync(testWorkspace)) {
      fs.mkdirSync(testWorkspace, { recursive: true });
    }

    findingStore = new FindingStore();
    storageManager = new AuditStorageManager(testWorkspace);
    configManager = new ConfigurationManager();

    messageHandlers = new Map();
    mockWebviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: vi.fn((handler: Function) => {
          messageHandlers.set('default', handler);
          return { dispose: vi.fn() };
        }),
        postMessage: vi.fn(),
      },
      onDidDispose: vi.fn(),
    };

    sidebarProvider = new CraftLensSidebarProvider(
      findingStore,
      storageManager,
      configManager,
      undefined,
      createDefaultProjectContext()
    );
    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('Focus Area 1: Inline Issue Labels & Severity Color Derivation', () => {
    it('maps canonical severity levels to designated restrained color tokens without neon glow', () => {
      // Critical / Error -> Red
      expect(SEMANTIC_SEVERITY_MAP.error.color).toBe('#ef4444');
      expect(DIAGNOSTIC_DESIGN_TOKENS.critical.color).toBe('#ef4444');

      // Warning -> Orange
      expect(SEMANTIC_SEVERITY_MAP.warning.color).toBe('#f97316');
      expect(DIAGNOSTIC_DESIGN_TOKENS.warning.color).toBe('#f97316');

      // Moderate / Medium -> Orange / Amber
      expect(SEMANTIC_SEVERITY_MAP.moderate.color).toBe('#ea580c');
      expect(DIAGNOSTIC_DESIGN_TOKENS.moderate.color).toBe('#ea580c');

      // Suggestion / Low -> Yellow
      expect(SEMANTIC_SEVERITY_MAP.info.color).toBe('#eab308');
      expect(SEMANTIC_SEVERITY_MAP.info.label).toBe('Suggestion');
      expect(DIAGNOSTIC_DESIGN_TOKENS.suggestion.color).toBe('#eab308');
    });

    it('derives inline label badges strictly from severity and category', () => {
      const suggestionFinding: Finding = {
        id: 'sug-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'design',
        message: 'AI gradient pattern detected',
        title: 'AI gradient pattern detected',
        whatIsWrong: 'This gradient does not appear to follow the visual language.',
        location: createLocation('/src/card.tsx', 10, 1),
      };

      const warningFinding: Finding = {
        id: 'warn-1',
        ruleId: 'CP-007',
        severity: 'warning',
        category: 'design',
        message: 'Repeated card treatment',
        title: 'Repeated card treatment',
        whatIsWrong: 'Repeated cards reduce visual contrast.',
        location: createLocation('/src/grid.tsx', 20, 1),
      };

      const securityFinding: Finding = {
        id: 'sec-1',
        ruleId: 'SEC-B01',
        severity: 'critical',
        category: 'security',
        message: 'Missing authorization check',
        title: 'Missing authorization check',
        whatIsWrong: 'Route accesses private data without check.',
        location: createLocation('/src/api.ts', 30, 1),
      };

      findingStore.setFindingsForFile('/src/card.tsx', [suggestionFinding]);
      findingStore.setFindingsForFile('/src/grid.tsx', [warningFinding]);
      findingStore.setFindingsForFile('/src/api.ts', [securityFinding]);

      const html = mockWebviewView.webview.html;

      // Suggestion badge
      expect(html).toContain('sev-badge info');
      expect(html).toContain('SUGGESTION');
      expect(html).toContain('AI gradient pattern detected');

      // Warning badge
      expect(html).toContain('sev-badge warning');
      expect(html).toContain('WARNING');
      expect(html).toContain('Repeated card treatment');

      // Security badge
      expect(html).toContain('sev-badge error');
      expect(html).toContain('SECURITY');
      expect(html).toContain('Missing authorization check');
    });

    it('provides CodeLens titles with [SEVERITY] prefix above affected code lines', () => {
      const mockAdapter: any = {
        getFindingsForFile: vi.fn(() => [
          {
            id: 'test-codelens-1',
            ruleId: 'UI-001',
            severity: 'suggestion',
            category: 'design',
            title: 'AI gradient pattern detected',
            location: createLocation('/src/hero.tsx', 15, 1),
            suggestions: [
              {
                id: 'sug-1',
                title: 'Replace generic gradient',
                replacement: 'var(--surface)',
                safe: true,
              },
            ],
          },
        ]),
      };

      const codeLensProvider = new CraftLensCodeLensProvider(mockAdapter, configManager);
      const lenses = codeLensProvider.provideCodeLenses(
        { uri: { fsPath: '/src/hero.tsx' } } as any,
        {} as any
      );

      expect(lenses.length).toBeGreaterThanOrEqual(2);
      expect(lenses[0].command.title).toBe('[SUGGESTION] AI gradient pattern detected');
      expect(lenses[1].command.title).toContain('Suggested Fix');
    });
  });

  describe('Focus Area 2: Suggested Fix Restoration & Contextual Fix Pipeline', () => {
    it('generates contextual fix suggestions for AI gradient pattern', () => {
      const finding: Finding = {
        id: 'grad-1',
        ruleId: 'UI-001',
        severity: 'low',
        category: 'design',
        message: 'AI gradient pattern detected',
        title: 'AI gradient pattern detected',
        evidence: [{ snippet: 'background: linear-gradient(to right, #6366f1, #a855f7);' }],
        location: createLocation('/src/banner.tsx', 5, 1),
      };

      const suggestions = ContextAwareFixGenerator.generateSuggestions(finding, createDefaultProjectContext());
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].explanation).toContain('Replace the decorative gradient with the project\'s existing surface/background treatment');
      expect(suggestions[0].safe).toBe(true);
    });

    it('generates contextual fix suggestions for repeated card treatment', () => {
      const finding: Finding = {
        id: 'card-1',
        ruleId: 'CP-007',
        severity: 'medium',
        category: 'design',
        message: 'Repeated card treatment detected',
        title: 'Repeated card treatment',
        location: createLocation('/src/services.tsx', 12, 1),
      };

      const suggestions = ContextAwareFixGenerator.generateSuggestions(finding, createDefaultProjectContext());
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].explanation).toContain('Normalize card spacing using the existing card component and project spacing token');
    });

    it('renders [ Suggested Fix ] alongside [ Reject ] in finding cards', () => {
      const fixableFinding: Finding = {
        id: 'fix-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'design',
        title: 'AI gradient pattern detected',
        whatIsWrong: 'Does not match project surface language.',
        location: createLocation('/src/badge.tsx', 8, 1),
        evidence: [{ snippet: 'linear-gradient(45deg, #f00, #00f)' }],
        suggestions: [
          {
            id: 'sug-1',
            title: 'Use surface token',
            explanation: 'Replace with design token',
            type: 'autofix',
            confidence: 0.95,
            safe: true,
            replacement: 'var(--surface)',
          },
        ],
      };

      findingStore.setFindingsForFile('/src/badge.tsx', [fixableFinding]);
      const html = mockWebviewView.webview.html;

      expect(html).toContain('fix-action-btn');
      expect(html).toContain('Suggested Fix');
      expect(html).toContain('reject-action-btn');
      expect(html).toContain('Reject');
      // Visually attached code snippet below
      expect(html).toContain('class="code-snippet-box"');
      expect(html).toContain('linear-gradient(45deg, #f00, #00f)');
    });

    it('handles manual-only findings gracefully with [ Manual fix ] state', () => {
      const manualFinding: Finding = {
        id: 'manual-1',
        ruleId: 'SEC-B01',
        severity: 'critical',
        category: 'security',
        title: 'Missing authorization check',
        whatIsWrong: 'Private route lacks authorization.',
        fix: 'manual',
        howToFix: 'Add authorization middleware to router endpoint.',
        location: createLocation('/src/routes.ts', 22, 1),
      };

      findingStore.setFindingsForFile('/src/routes.ts', [manualFinding]);
      const html = mockWebviewView.webview.html;

      expect(html).toContain('Manual fix');
      expect(html).toContain('Reject');
    });

    it('dispatches applySuggestedFix message to extension command', async () => {
      const finding: Finding = {
        id: 'finding-apply-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'design',
        title: 'AI gradient pattern detected',
        location: createLocation('/src/hero.tsx', 4, 1),
        suggestions: [{ id: 'sug-1', title: 'Fix gradient', replacement: 'bg-surface', safe: true }],
      };
      findingStore.setFindingsForFile('/src/hero.tsx', [finding]);

      const handler = messageHandlers.get('default');
      expect(handler).toBeDefined();

      await handler!({ type: 'applySuggestedFix', findingId: 'finding-apply-1' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'craftlens.applySuggestion',
        'finding-apply-1',
        0
      );
    });

    it('dispatches rejectFinding message without altering unrelated issues', async () => {
      const finding: Finding = {
        id: 'finding-reject-1',
        ruleId: 'CP-007',
        severity: 'warning',
        category: 'design',
        title: 'Repeated card treatment',
        location: createLocation('/src/cards.tsx', 14, 1),
      };
      findingStore.setFindingsForFile('/src/cards.tsx', [finding]);

      const handler = messageHandlers.get('default');
      expect(handler).toBeDefined();

      await handler!({ type: 'rejectFinding', findingId: 'finding-reject-1' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'craftlens.rejectFinding',
        expect.objectContaining({ id: 'finding-reject-1', ruleId: 'CP-007' })
      );
    });
  });

  describe('Focus Area 3: Top Sidebar Commands & Visual Alignment', () => {
    it('verifies package.json command contributions have $(refresh) and $(checklist) icons', () => {
      const pkgPath = path.resolve(__dirname, '../../apps/vscode-extension/package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      const runAuditCmd = pkg.contributes.commands.find((c: any) => c.command === 'craftlens.runAudit');
      expect(runAuditCmd).toBeDefined();
      expect(runAuditCmd.title).toBe('Run Audit');
      expect(runAuditCmd.icon).toBe('$(refresh)');

      const checklistCmd = pkg.contributes.commands.find((c: any) => c.command === 'craftlens.openMasterChecklist');
      expect(checklistCmd).toBeDefined();
      expect(checklistCmd.title).toBe('Open Master Audit Checklist');
      expect(checklistCmd.icon).toBe('$(checklist)');
    });

    it('verifies that the sidebar webview header toolbar renders overview button cleanly', () => {
      const html = mockWebviewView.webview.html;

      expect(html).toContain('class="top-toolbar"');
      expect(html).toContain('class="project-overview-btn"');
      expect(html).not.toContain('class="top-icon-btn" onclick="runAudit()"');
      expect(html).not.toContain('class="top-icon-btn" onclick="openMasterChecklist()"');
    });

    it('verifies zero antiSlop references exist in package.json and sidebar HTML', () => {
      const pkgPath = path.resolve(__dirname, '../../apps/vscode-extension/package.json');
      const pkgText = fs.readFileSync(pkgPath, 'utf8');
      expect(pkgText).not.toContain('antiSlop');

      const html = mockWebviewView.webview.html;
      expect(html).not.toContain('antiSlop');
    });

    it('dispatches runAudit and openMasterChecklist messages on invocation', async () => {
      const handler = messageHandlers.get('default');
      expect(handler).toBeDefined();

      await handler!({ type: 'runAudit' });
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('craftlens.runAudit');

      await handler!({ type: 'openMasterChecklist' });
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('craftlens.openMasterChecklist');
    });
  });
});
