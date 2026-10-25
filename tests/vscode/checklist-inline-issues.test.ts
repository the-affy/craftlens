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
  Finding,
  createLocation,
  generateMasterChecklist,
  createDefaultProjectContext,
} from '@craftlens/core';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { RuleRegistry, registerDefaultRules, RuleEngine } from '@craftlens/rule-engine';

describe('Part 1 — Checklist View issues expandable panel & 4-state lifecycle', () => {
  const testWorkspace = path.resolve(__dirname, '../fixtures/checklist-inline-workspace');
  let findingStore: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let ruleRegistry: RuleRegistry;
  let engine: RuleEngine;
  let sidebarProvider: CraftLensSidebarProvider;
  let renderedHtml = '';
  let messageHandler: ((msg: any) => Promise<void> | void) | undefined;

  beforeEach(() => {
    if (!fs.existsSync(testWorkspace)) {
      fs.mkdirSync(testWorkspace, { recursive: true });
    }

    findingStore = new FindingStore();
    storageManager = new AuditStorageManager(testWorkspace);
    configManager = new ConfigurationManager();

    ruleRegistry = new RuleRegistry();
    registerDefaultRules(ruleRegistry);
    engine = new RuleEngine(ruleRegistry);

    sidebarProvider = new CraftLensSidebarProvider(
      findingStore,
      storageManager,
      configManager,
      engine,
      createDefaultProjectContext(testWorkspace)
    );

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
        postMessage: async () => true,
      },
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    // Switch to checklist tab
    messageHandler?.({ type: 'switchTab', tab: 'checklist' });
  });

  afterEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it('Requirement 1 & 3: View issues expands inline directly below criterion without navigating away', async () => {
    // Add finding for cq-exceptions (AP-008)
    const loc = createLocation(path.join(testWorkspace, 'src/test.ts'), 42, 1, 10, 42, 30, 40);
    const finding: Finding = {
      id: 'f-ap008-1',
      ruleId: 'AP-008',
      message: 'Exception swallowed',
      problemTitle: 'Exception is swallowed silently',
      severity: 'error',
      location: loc,
      filePath: loc.filePath,
      startLine: 42,
      evidence: [{ line: 42, snippet: 'catch (e) {}' }],
    };
    findingStore.setFindingsForFile(loc.filePath, [finding]);

    expect(renderedHtml).toContain('CHECKLIST');
    expect(renderedHtml).toContain('Errors are handled clearly');
    expect(renderedHtml).toContain('1 issue');
    expect(renderedHtml).toContain('View issues');
    expect(renderedHtml).not.toContain('<div class="checklist-issues-panel"');

    // Click "View issues" for cq-exceptions
    await messageHandler?.({
      type: 'toggleChecklistIssues',
      criterionId: 'cq-exceptions',
    });

    // Remained on checklist tab
    expect(renderedHtml).toContain('CHECKLIST');
    expect(renderedHtml).toContain('<div class="checklist-issues-panel"');
    expect(renderedHtml).toContain('data-criterion-id="cq-exceptions"');
    expect(renderedHtml).toContain('Hide issues');
    // Inline panel displays the finding
    expect(renderedHtml).toContain('Exception is swallowed silently');
    expect(renderedHtml).toContain('test.ts:42');
  });

  it('Requirement 2: expand/collapse behavior and single open panel', async () => {
    // 1. Expand cq-exceptions
    await messageHandler?.({
      type: 'toggleChecklistIssues',
      criterionId: 'cq-exceptions',
    });
    expect(renderedHtml).toContain('data-criterion-id="cq-exceptions"');
    expect(renderedHtml).toContain('Hide issues');

    // 2. Click Hide issues on same criterion -> collapses
    await messageHandler?.({
      type: 'toggleChecklistIssues',
      criterionId: 'cq-exceptions',
    });
    expect(renderedHtml).not.toContain('<div class="checklist-issues-panel"');
    expect(renderedHtml).toContain('View issues');

    // 3. Open cq-exceptions then open cq-types -> cq-exceptions collapses, cq-types opens
    await messageHandler?.({
      type: 'toggleChecklistIssues',
      criterionId: 'cq-exceptions',
    });
    expect(renderedHtml).toContain('checklist-issues-panel');
    expect(renderedHtml).toContain('data-criterion-id="cq-exceptions"');

    await messageHandler?.({
      type: 'toggleChecklistIssues',
      criterionId: 'cq-types',
    });
    expect(renderedHtml).toContain('<div class="checklist-issues-panel" data-criterion-id="cq-types"');
    expect(renderedHtml).not.toContain('<div class="checklist-issues-panel" data-criterion-id="cq-exceptions"');
  });

  it('Requirement 4 & 5: reuses Audit finding presentation and filters strictly by relatedRuleIds', async () => {
    const loc1 = createLocation(path.join(testWorkspace, 'src/test.ts'), 42, 1, 10, 42, 30, 40);
    const f1: Finding = {
      id: 'f-ap008',
      ruleId: 'AP-008',
      message: 'Exception swallowed',
      problemTitle: 'Exception is swallowed silently',
      severity: 'error',
      location: loc1,
      filePath: loc1.filePath,
      startLine: 42,
    };

    const loc2 = createLocation(path.join(testWorkspace, 'src/other.ts'), 10, 1, 10, 10, 30, 40);
    const f2: Finding = {
      id: 'f-ap014',
      ruleId: 'AP-014',
      message: 'Explicit any escape hatch',
      problemTitle: 'Strict TypeScript any escape hatch',
      severity: 'warning',
      location: loc2,
      filePath: loc2.filePath,
      startLine: 10,
    };

    findingStore.setFindingsForFile(loc1.filePath, [f1]);
    findingStore.setFindingsForFile(loc2.filePath, [f2]);

    // Expand cq-exceptions (AP-008 only)
    await messageHandler?.({
      type: 'toggleChecklistIssues',
      criterionId: 'cq-exceptions',
    });

    expect(renderedHtml).toContain('Exception is swallowed silently');
    // f2 (AP-014) belongs to cq-types, so it MUST NOT appear in cq-exceptions panel!
    expect(renderedHtml).not.toContain('Strict TypeScript any escape hatch');
    expect(renderedHtml).not.toContain('other.ts:10');
  });

  it('Requirement 6: provides clear feedback when there are zero issues', async () => {
    // Zero issues in workspace
    findingStore.clearAll();

    await messageHandler?.({
      type: 'toggleChecklistIssues',
      criterionId: 'cq-exceptions',
    });

    expect(renderedHtml).toContain('checklist-issues-panel');
    expect(renderedHtml).toContain('0 issues');
    expect(renderedHtml).toContain('No issues detected for this criterion.');
  });

  it('Requirement 9: supports 4-state Checklist model (Not detected, Issues, Acknowledged, Fixed)', async () => {
    // State 1: Not detected (unchecked, 0 issues)
    findingStore.clearAll();
    sidebarProvider.refresh();
    expect(renderedHtml).toContain('state-not-detected');
    expect(renderedHtml).not.toContain('class="checklist-user-icon"');

    // State 2: Issues (unchecked, >0 issues, red)
    const loc = createLocation(path.join(testWorkspace, 'src/test.ts'), 42, 1, 10, 42, 30, 40);
    const f: Finding = {
      id: 'f-ap008',
      ruleId: 'AP-008',
      message: 'Exception swallowed',
      severity: 'error',
      location: loc,
      filePath: loc.filePath,
      startLine: 42,
    };
    findingStore.setFindingsForFile(loc.filePath, [f]);
    expect(renderedHtml).toContain('state-issues');
    expect(renderedHtml).not.toContain('class="checklist-user-icon"');

    // State 3: Acknowledged (checked, >0 issues, yellow, user icon)
    await messageHandler?.({
      type: 'toggleChecklistCriterion',
      id: 'cq-exceptions',
      checked: true,
    });
    expect(renderedHtml).toContain('state-acknowledged');
    expect(renderedHtml).toContain('class="checklist-user-icon"');
    expect(renderedHtml).toContain('1 issue');

    // State 4: Fixed (checked, 0 issues, green, no user icon)
    findingStore.clearAll();
    sidebarProvider.refresh();
    expect(renderedHtml).toContain('state-fixed');
    expect(renderedHtml).not.toContain('class="checklist-user-icon"');
  });

  it('Requirement 40: handles partial fixes and does not auto-acknowledge new audit issues', async () => {
    const loc1 = createLocation(path.join(testWorkspace, 'src/a.ts'), 10, 1, 10, 10, 30, 40);
    const loc2 = createLocation(path.join(testWorkspace, 'src/b.ts'), 20, 1, 10, 20, 30, 40);

    const f1: Finding = {
      id: 'f1',
      ruleId: 'AP-008',
      message: 'Swallowed 1',
      severity: 'error',
      location: loc1,
      filePath: loc1.filePath,
    };
    const f2: Finding = {
      id: 'f2',
      ruleId: 'AP-008',
      message: 'Swallowed 2',
      severity: 'error',
      location: loc2,
      filePath: loc2.filePath,
    };

    const ctx = createDefaultProjectContext(testWorkspace);
    const auditBefore = storageManager.syncAudit(ctx, [f1, f2], 'moderate');
    const cqItem = auditBefore.checklist.items.find(i => i.id === 'cq-exceptions');
    expect(cqItem?.findingCount).toBe(2);
    expect(cqItem?.checked).toBe(false);

    // 1. Partial fix applied
    storageManager.markCriteriaCheckedForFinding(f1);
    const auditAfter1 = storageManager.loadAudit();
    const itemAfter1 = auditAfter1?.items.find(i => i.id === 'cq-exceptions');
    expect(itemAfter1?.findingCount).toBe(1);
    expect(itemAfter1?.checked).toBe(false); // Still unchecked with remaining issues

    // 2. Successful fix of remaining issue
    storageManager.markCriteriaCheckedForFinding(f2);
    const auditAfter2 = storageManager.loadAudit();
    const itemAfter2 = auditAfter2?.items.find(i => i.id === 'cq-exceptions');
    expect(itemAfter2?.findingCount).toBe(0);
    expect(itemAfter2?.checked).toBe(true); // Full fix transitions to checked/green

    // 3. New audit introduces a new issue: must NOT be automatically acknowledged!
    const f3: Finding = {
      id: 'f3',
      ruleId: 'AP-008',
      message: 'New issue',
      severity: 'error',
      location: loc1,
      filePath: loc1.filePath,
    };
    const auditResync = generateMasterChecklist(ctx, [f3], 'moderate', auditAfter2!);
    const itemResync = auditResync.items.find(i => i.id === 'cq-exceptions');
    expect(itemResync?.checked).toBe(false);
    expect(itemResync?.manualOverride).toBe(false);
  });
});
