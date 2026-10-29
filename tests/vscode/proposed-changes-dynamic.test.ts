import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showOpenDialog: vi.fn(),
      showInputBox: vi.fn(),
      showTextDocument: vi.fn(async () => ({})),
      createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
      createWebviewPanel: vi.fn(() => ({
        webview: { html: '', onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })), postMessage: vi.fn() },
        reveal: vi.fn(),
        dispose: vi.fn(),
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      })),
      activeTextEditor: undefined,
    },
    commands: {
      executeCommand: vi.fn(),
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock-ws' }],
      getConfiguration: vi.fn(() => ({ get: vi.fn((k: any, d: any) => d), update: vi.fn() })),
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
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file', toString: () => `file://${p}` }),
      joinPath: (base: any, ...seg: string[]) => ({ fsPath: path.join(base.fsPath || base, ...seg), scheme: 'file' }),
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
import {
  FindingStore,
  AuditStorageManager,
  ChangeManager,
  VerificationEngine,
  createDefaultProjectContext,
} from '@craftlens/core';
import { RuleEngine, RuleRegistry, registerDefaultRules } from '@craftlens/rule-engine';
import { AstCache } from '@craftlens/parser';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { ProjectOverviewPanel } from '../../apps/vscode-extension/src/overview/project-overview-panel.js';
import { DocumentWatcher } from '../../apps/vscode-extension/src/watcher/document-watcher.js';

function getChangesPanelHtml(fullHtml: string): string {
  const start = fullHtml.indexOf('<section class="panel-col changes-panel">');
  if (start === -1) return '';
  const end = fullHtml.indexOf('</section>', start);
  return end === -1 ? fullHtml.substring(start) : fullHtml.substring(start, end + 10);
}

describe('Proposed Changes & Diff Preview Dynamic Pipeline', () => {
  let tempDir: string;
  let store: FindingStore;
  let storageManager: AuditStorageManager;
  let changeManager: ChangeManager;
  let verificationEngine: VerificationEngine;
  let configManager: ConfigurationManager;
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    (ProjectOverviewPanel as any).currentPanel = undefined;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftlens-proposed-test-'));
    store = new FindingStore();
    storageManager = new AuditStorageManager(tempDir);
    changeManager = new ChangeManager(tempDir, store.getIssueRegistry());
    verificationEngine = new VerificationEngine(store.getIssueRegistry(), changeManager, async () => [], tempDir);
    configManager = new ConfigurationManager();
    const registry = new RuleRegistry();
    registerDefaultRules(registry);
    ruleEngine = new RuleEngine(registry, new AstCache());
  });

  afterEach(() => {
    if (ProjectOverviewPanel.currentPanel) {
      ProjectOverviewPanel.currentPanel.dispose();
      (ProjectOverviewPanel as any).currentPanel = undefined;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Dynamic Issue Selection & Patch Generation', () => {
    it('dynamically switches patch when user selects Issue A vs Issue B', () => {
      const fileA = path.join(tempDir, 'src/ComponentA.tsx');
      const fileB = path.join(tempDir, 'src/ComponentB.tsx');
      fs.mkdirSync(path.dirname(fileA), { recursive: true });
      fs.writeFileSync(fileA, 'export const CompA = () => <div className="text-blue-500" />;\n', 'utf-8');
      fs.writeFileSync(fileB, 'export const CompB = () => <button style={{ color: "red" }} />;\n', 'utf-8');

      const findingA = {
        id: 'finding-token-a',
        ruleId: 'usr_design_tokens',
        category: 'ui-ux' as const,
        severity: 'warning' as const,
        problemTitle: 'Hardcoded Tailwind Color A',
        message: 'Replace text-blue-500 with semantic token',
        filePath: fileA,
        location: { filePath: fileA, line: 1, column: 1, endLine: 1, endColumn: 60 },
        codeSnippet: '<div className="text-blue-500" />',
        suggestions: [{
          id: 'sug-a',
          title: 'Use token var(--color-primary)',
          description: 'Use token var(--color-primary)',
          fileDiff: '<div className="text-[var(--color-primary)]" />',
          replacement: 'export const CompA = () => <div className="text-[var(--color-primary)]" />;\n',
        }],
      };

      const findingB = {
        id: 'finding-token-b',
        ruleId: 'usr_design_tokens',
        category: 'ui-ux' as const,
        severity: 'critical' as const,
        problemTitle: 'Hardcoded Inline Style B',
        message: 'Replace red with semantic foreground token',
        filePath: fileB,
        location: { filePath: fileB, line: 1, column: 1, endLine: 1, endColumn: 60 },
        codeSnippet: '<button style={{ color: "red" }} />',
        suggestions: [{
          id: 'sug-b',
          title: 'Use var(--vscode-foreground)',
          description: 'Use var(--vscode-foreground)',
          fileDiff: '<button style={{ color: "var(--vscode-foreground)" }} />',
          replacement: 'export const CompB = () => <button style={{ color: "var(--vscode-foreground)" }} />;\n',
        }],
      };

      store.setFindingsForFile(fileA, [findingA as any]);
      store.setFindingsForFile(fileB, [findingB as any]);

      // 1. Render Overview Panel with finding A selected
      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: '/mock/ext' } as any,
        store,
        storageManager,
        configManager,
        ruleEngine,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );
      panel.setSelectedFindingId('finding-token-a');
      const htmlA = panel.getHtml();

      // Finding A patch must be rendered in the changes panel
      const changesPanelA = getChangesPanelHtml(htmlA);
      expect(changesPanelA).toContain('ComponentA.tsx');
      expect(changesPanelA).toContain('text-[var(--color-primary)]');
      expect(changesPanelA).not.toContain('ComponentB.tsx');
      expect(changesPanelA).not.toContain('Hardcoded Inline Style B');
      expect(changesPanelA).toContain('Apply Changes');

      // 2. Select finding B
      panel.setSelectedFindingId('finding-token-b');
      const htmlB = panel.getHtml();

      // Finding B patch must replace finding A patch in the changes panel
      const changesPanelB = getChangesPanelHtml(htmlB);
      expect(changesPanelB).toContain('ComponentB.tsx');
      expect(changesPanelB).toContain('var(--vscode-foreground)');
      expect(changesPanelB).not.toContain('ComponentA.tsx');
      expect(changesPanelB).not.toContain('text-[var(--color-primary)]');
      expect(changesPanelB).toContain('Apply Changes');
    });

    it('enforces before !== after: hides Apply Changes when no change or identical code', () => {
      const fileC = path.join(tempDir, 'src/NoChange.tsx');
      fs.mkdirSync(path.dirname(fileC), { recursive: true });
      fs.writeFileSync(fileC, 'export const unchanged = 42;\n', 'utf-8');

      const findingNoDiff = {
        id: 'finding-no-diff',
        ruleId: 'AP-008',
        category: 'code' as const,
        severity: 'info' as const,
        problemTitle: 'Informational Code Finding',
        message: 'No automatic code transformation available',
        filePath: fileC,
        location: { filePath: fileC, line: 1, column: 1, endLine: 1, endColumn: 22 },
        codeSnippet: 'export const unchanged = 42;',
        // No suggestions or replacement
        suggestions: [],
      };

      store.setFindingsForFile(fileC, [findingNoDiff as any]);

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: '/mock/ext' } as any,
        store,
        storageManager,
        configManager,
        ruleEngine,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );
      panel.setSelectedFindingId('finding-no-diff');
      const html = panel.getHtml();

      const changesPanel = getChangesPanelHtml(html);
      // Apply button MUST NOT be present in changes-panel
      expect(changesPanel).not.toContain('Apply Changes');
      // Explanatory placeholder must be shown
      expect(changesPanel).toContain('No code change was generated for this finding.');
      expect(changesPanel).toContain('View Guidance in suggestions.md');
    });
  });

  describe('Single Patch Contract (Previewed Patch === Applied Patch)', () => {
    it('applies the exact previewed patch ID through changeManager without regeneration', async () => {
      const targetFile = path.join(tempDir, 'src/SafeButton.tsx');
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      const origCode = 'export const SafeButton = () => <button className="bg-red-500">Delete</button>;\n';
      fs.writeFileSync(targetFile, origCode, 'utf-8');

      const finding = {
        id: 'btn-token-issue',
        ruleId: 'usr_design_tokens',
        category: 'ui-ux' as const,
        severity: 'warning' as const,
        problemTitle: 'Use Tokenized Destructive Button',
        message: 'Replace bg-red-500 with semantic danger token',
        filePath: targetFile,
        location: { filePath: targetFile, line: 1, column: 1, endLine: 1, endColumn: origCode.length },
        codeSnippet: origCode,
        suggestions: [{
          id: 'sug-danger-token',
          title: 'Use var(--status-error)',
          description: 'Use semantic danger token',
          replacement: 'export const SafeButton = () => <button className="bg-[var(--status-error)]">Delete</button>;\n',
        }],
      };
      store.setFindingsForFile(targetFile, [finding as any]);

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: '/mock/ext' } as any,
        store,
        storageManager,
        configManager,
        ruleEngine,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );
      panel.setSelectedFindingId('btn-token-issue');
      const html = panel.getHtml();

      // Extract changeId from the Apply Changes button in html
      const match = html.match(/onclick="applyFix\('([^']+)'\)">Apply Changes/);
      expect(match).not.toBeNull();
      const changeId = match![1];

      // Retrieve the exact change object from changeManager
      const proposedChange = changeManager.getChange(changeId);
      expect(proposedChange).toBeDefined();
      expect(proposedChange!.status).toBe('proposed');
      expect(proposedChange!.files[0].originalContent).toBe(origCode);
      expect(proposedChange!.files[0].newContent).toContain('bg-[var(--status-error)]');

      // Now simulate clicking Apply via webview message
      const applyResult = await changeManager.applyChange(changeId);
      expect(applyResult.success).toBe(true);

      // Verify file on disk now matches the exact proposed content
      const diskContent = fs.readFileSync(targetFile, 'utf-8');
      expect(diskContent.trim()).toBe('export const SafeButton = () => <button className="bg-[var(--status-error)]">Delete</button>;');

      // Verify status in ChangeManager
      expect(changeManager.getChange(changeId)?.status).toBe('applied');

      // Run verification engine
      const verifyResult = await verificationEngine.verifyChange(changeId);
      expect(verifyResult.status).toBe('passed');
      expect(changeManager.getChange(changeId)?.status).toBe('verified');
    });

    it('discarding removes proposal and keeps source unchanged', () => {
      const srcFile = path.join(tempDir, 'src/SafeDiscard.tsx');
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      const origCode = 'export const val = "preserve-me";\n';
      fs.writeFileSync(srcFile, origCode, 'utf-8');

      const finding = {
        id: 'discard-issue',
        ruleId: 'usr_design_tokens',
        category: 'ui-ux' as const,
        severity: 'low' as const,
        problemTitle: 'Discard Me',
        message: 'Testing discard proposal',
        filePath: srcFile,
        location: { filePath: srcFile, line: 1, column: 1, endLine: 1, endColumn: origCode.length },
        codeSnippet: origCode,
        suggestions: [{
          id: 'sug-disc',
          title: 'Unwanted Change',
          replacement: 'export const val = "unwanted";\n',
        }],
      };
      store.setFindingsForFile(srcFile, [finding as any]);

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: '/mock/ext' } as any,
        store,
        storageManager,
        configManager,
        ruleEngine,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );
      panel.setSelectedFindingId('discard-issue');
      const html = panel.getHtml();

      const match = html.match(/onclick="discardFix\('([^']+)'\)">Discard/);
      expect(match).not.toBeNull();
      const changeId = match![1];

      const discarded = changeManager.discardChange(changeId);
      expect(discarded).toBe(true);
      expect(changeManager.getChange(changeId)?.status).toBe('rejected');
      expect(fs.readFileSync(srcFile, 'utf-8')).toBe(origCode);
    });
  });

  describe('Diff Preview Views & Line Derivation', () => {
    it('correctly formats unified diff, before view, and after view', () => {
      const targetFile = path.join(tempDir, 'src/ViewModeTest.tsx');
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      const orig = 'export const title = "old_title";\n';
      fs.writeFileSync(targetFile, orig, 'utf-8');

      const finding = {
        id: 'view-mode-finding',
        ruleId: 'usr_design_tokens',
        category: 'ui-ux' as const,
        severity: 'high' as const,
        problemTitle: 'View Mode Slicing',
        message: 'Line replace',
        filePath: targetFile,
        location: { filePath: targetFile, line: 1, column: 1, endLine: 1, endColumn: orig.length },
        codeSnippet: orig,
        suggestions: [{
          id: 'sug-view',
          title: 'Upgrade title',
          replacement: 'export const title = "new_title";\n',
        }],
      };
      store.setFindingsForFile(targetFile, [finding as any]);

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: '/mock/ext' } as any,
        store,
        storageManager,
        configManager,
        ruleEngine,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );
      panel.setSelectedFindingId('view-mode-finding');

      // Default diff mode
      panel.setDiffViewMode('diff');
      const htmlDiff = panel.getHtml();
      const changesPanelDiff = getChangesPanelHtml(htmlDiff);
      expect(changesPanelDiff).toContain('diff-del-line');
      expect(changesPanelDiff).toContain('diff-add-line');
      expect(changesPanelDiff).toContain('old_title');
      expect(changesPanelDiff).toContain('new_title');

      // Before mode
      panel.setDiffViewMode('before');
      const htmlBefore = panel.getHtml();
      const changesPanelBefore = getChangesPanelHtml(htmlBefore);
      expect(changesPanelBefore).toContain('old_title');
      expect(changesPanelBefore).not.toContain('new_title');

      // After mode
      panel.setDiffViewMode('after');
      const htmlAfter = panel.getHtml();
      const changesPanelAfter = getChangesPanelHtml(htmlAfter);
      expect(changesPanelAfter).toContain('new_title');
      expect(changesPanelAfter).not.toContain('old_title');
    });

    it('applies semantic severity tinting to diff container and banner', () => {
      const critFile = path.join(tempDir, 'src/Crit.tsx');
      fs.mkdirSync(path.dirname(critFile), { recursive: true });
      const orig = 'export const secretKey = "insecure_val";\n';
      fs.writeFileSync(critFile, orig, 'utf-8');

      const finding = {
        id: 'crit-finding',
        ruleId: 'SEC-001',
        category: 'security' as const,
        severity: 'critical' as const,
        problemTitle: 'Critical Security Issue',
        message: 'Insecure key',
        filePath: critFile,
        location: { filePath: critFile, line: 1, column: 1, endLine: 1, endColumn: orig.length },
        codeSnippet: orig,
        suggestions: [{
          id: 'sug-sec',
          title: 'Remove secret',
          replacement: 'export const secretKey = process.env.API_KEY || "";\n',
        }],
      };
      store.setFindingsForFile(critFile, [finding as any]);

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: '/mock/ext' } as any,
        store,
        storageManager,
        configManager,
        ruleEngine,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );
      panel.setSelectedFindingId('crit-finding');
      const html = panel.getHtml();

      const changesPanel = getChangesPanelHtml(html);
      expect(changesPanel).toContain('sev-banner--error');
      expect(changesPanel).toContain('sev-tint--error');
    });
  });

  describe('DocumentWatcher Rapid Save Debouncing', () => {
    it('coalesces 5 rapid document saves within 50ms into a single audit scan', async () => {
      vi.useFakeTimers();

      const watcher = new DocumentWatcher({
        engine: { analyze: vi.fn(() => ({ findings: [] })) } as any,
        configManager: configManager as any,
        diagnosticsAdapter: { getFindingsForFile: vi.fn(() => []), update: vi.fn() } as any,
        debounceMs: 300,
      });

      const scanSpy = vi.spyOn(watcher, 'scanDocument').mockImplementation(() => {});

      const fakeDoc = {
        uri: { fsPath: path.join(tempDir, 'test.ts'), scheme: 'file' },
        languageId: 'typescript',
        isUntitled: false,
        isClosed: false,
        version: 1,
        getText: () => 'const x = 1;',
      } as any;

      // Trigger 5 rapid saves in quick succession
      for (let i = 0; i < 5; i++) {
        watcher.scheduleSaveScan(fakeDoc);
        vi.advanceTimersByTime(10);
      }

      // At this point (50ms total), 300ms debounce hasn't elapsed yet
      expect(scanSpy).toHaveBeenCalledTimes(0);

      // Advance by remaining 300ms
      vi.advanceTimersByTime(350);

      // Now exactly 1 scan should have occurred
      expect(scanSpy).toHaveBeenCalledTimes(1);

      // Clean up
      watcher.dispose();
      vi.useRealTimers();
    });
  });
});
