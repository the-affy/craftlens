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

import {
  FindingStore,
  Finding,
  resolveFixCapability,
  ChangeManager,
  VerificationEngine,
  UniversalFixValidator,
  IssueRegistry,
  AuditStorageManager,
  createDefaultProjectContext,
} from '@craftlens/core';
import { ProjectOverviewPanel } from '../../apps/vscode-extension/src/overview/project-overview-panel.js';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { SidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { DetailPanelProvider } from '../../apps/vscode-extension/src/sidebar/detail-panel-provider.js';

describe('CraftLens — Unified Issue State, Fix Consistency & Dynamic Overview', () => {
  let tempDir: string;
  let issueRegistry: IssueRegistry;
  let findingStore: FindingStore;
  let changeManager: ChangeManager;
  let verificationEngine: VerificationEngine;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftlens-unified-test-'));
    fs.mkdirSync(path.join(tempDir, '.craftlens'), { recursive: true });
    issueRegistry = new IssueRegistry(tempDir);
    findingStore = new FindingStore(issueRegistry);
    changeManager = new ChangeManager(tempDir);
    verificationEngine = new VerificationEngine(tempDir);
    storageManager = new AuditStorageManager(tempDir);
    configManager = new ConfigurationManager();
    ProjectOverviewPanel.currentPanel = undefined;
  });

  afterEach(() => {
    if (ProjectOverviewPanel.currentPanel) {
      ProjectOverviewPanel.currentPanel.dispose();
      (ProjectOverviewPanel as any).currentPanel = undefined;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('1. Single Source of Truth for Selected Issue', () => {
    it('notifies listeners when selectedIssueId changes', () => {
      const selections: (string | null)[] = [];
      findingStore.onDidSelectIssue(id => selections.push(id));

      expect(findingStore.getSelectedIssueId()).toBeNull();

      findingStore.setSelectedIssueId('issue-1');
      expect(findingStore.getSelectedIssueId()).toBe('issue-1');

      findingStore.setSelectedIssueId('issue-2');
      expect(findingStore.getSelectedIssueId()).toBe('issue-2');

      findingStore.setSelectedIssueId(null);
      expect(findingStore.getSelectedIssueId()).toBeNull();

      expect(selections).toEqual(['issue-1', 'issue-2', null]);
    });

    it('clears selectedIssueId when the selected issue is resolved or removed', () => {
      const filePath = path.join(tempDir, 'test.ts');
      const finding: Finding = {
        id: 'finding-to-remove',
        ruleId: 'SEC-001',
        title: 'Security Boundary',
        message: 'Boundary violation',
        severity: 'error',
        filePath,
      };
      findingStore.setFindingsForFile(filePath, [finding]);
      findingStore.setSelectedIssueId('finding-to-remove');
      expect(findingStore.getSelectedIssueId()).toBe('finding-to-remove');

      findingStore.removeFinding('finding-to-remove');
      expect(findingStore.getSelectedIssueId()).toBeNull();
    });
  });

  describe('2. Fix Capability Consistency across Surfaces', () => {
    it('returns consistent FixCapability for an issue with an executable fix', () => {
      const targetFile = path.join(tempDir, 'styles.css');
      fs.writeFileSync(targetFile, '.btn { color: #38bdf8; }\n');

      const findingWithFix: Finding = {
        id: 'finding-fixable',
        ruleId: 'UI-TOKEN-001',
        title: 'Use design tokens',
        message: 'Hardcoded hex color used',
        severity: 'warning',
        category: 'ui',
        filePath: targetFile,
        location: {
          filePath: targetFile,
          start: { line: 1, column: 15 },
          end: { line: 1, column: 22 },
        },
        suggestions: [
          {
            id: 'sug-1',
            title: 'Use accent token',
            explanation: 'Replace hardcoded color with var(--color-accent)',
            replacement: 'var(--color-accent)',
            patch: 'var(--color-accent)',
            safe: true,
            type: 'autofix',
            range: { startLine: 1, startColumn: 15, endLine: 1, endColumn: 22 },
          },
        ],
      };

      findingStore.setFindingsForFile(targetFile, [findingWithFix]);

      const fixCap1 = findingStore.getFixCapability(findingWithFix);
      const fixCap2 = resolveFixCapability(findingWithFix);

      expect(fixCap1.canApply).toBe(true);
      expect(fixCap2.canApply).toBe(true);
      expect(fixCap1.skillName).toBe('Design System Consistency');
    });

    it('returns consistent FixCapability for an issue requiring manual/skill guidance', () => {
      const targetFile = path.join(tempDir, 'api.ts');
      fs.writeFileSync(targetFile, 'export function handleReq() {}\n');

      const findingNoFix: Finding = {
        id: 'finding-guidance-only',
        ruleId: 'SEC-AUTH-001',
        title: 'Missing authorization check',
        message: 'Handler does not check user permissions',
        severity: 'error',
        category: 'security',
        filePath: targetFile,
        whyItMatters: 'Unauthenticated callers can execute privileged operations.',
        howToFix: 'Wrap endpoint with requirePermission check.',
        fix: 'manual' as any,
      };

      findingStore.setFindingsForFile(targetFile, [findingNoFix]);

      const fixCap = findingStore.getFixCapability(findingNoFix);
      expect(fixCap.canApply).toBe(false);
      expect(fixCap.skillName).toBe('API Security Review');
      expect(fixCap.whyItMatters).toContain('Unauthenticated callers');
      expect(fixCap.suggestion).toBeTruthy();
    });
  });

  describe('3. ProjectOverviewPanel HTML Rendering with Unified State', () => {
    it('renders Fix Available badge, [Show Diff & Fix], and active diff pills for executable fix', () => {
      const cssFile = path.join(tempDir, 'button.css');
      fs.writeFileSync(cssFile, '.button {\n  color: #38bdf8;\n}\n');

      const finding: Finding = {
        id: 'ui-issue-1',
        ruleId: 'UI-TOKEN-001',
        title: 'Use design tokens',
        message: 'Hardcoded color',
        severity: 'warning',
        category: 'ui',
        filePath: cssFile,
        location: {
          filePath: cssFile,
          start: { line: 2, column: 10 },
          end: { line: 2, column: 17 },
        },
        suggestions: [
          {
            id: 'sug-1',
            title: 'Use token',
            explanation: 'Replace with var(--color-accent)',
            replacement: 'var(--color-accent)',
            patch: 'var(--color-accent)',
            safe: true,
            type: 'autofix',
            range: { startLine: 2, startColumn: 10, endLine: 2, endColumn: 17 },
          },
        ],
      };

      findingStore.setFindingsForFile(cssFile, [finding]);
      findingStore.setSelectedIssueId('ui-issue-1');

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: tempDir } as any,
        findingStore,
        storageManager,
        configManager,
        undefined,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );

      const html = panel.renderHtml();

      // Fix Available badges & pills
      expect(html).toContain('Fix available');
      expect(html).toContain('Show Diff &amp; Fix');
      expect(html).toContain('Apply Changes');

      // Diff toggle pills must NOT be disabled
      expect(html).not.toContain('<button class="toggle-pill disabled"');
      expect(html).toContain('onclick="setDiffViewMode(\'diff\')"');
      expect(html).toContain('onclick="setDiffViewMode(\'before\')"');
      expect(html).toContain('onclick="setDiffViewMode(\'after\')"');
    });

    it('renders "No automatic fix", disabled pills, and rich explanation panel when no executable fix', () => {
      const secFile = path.join(tempDir, 'auth.ts');
      fs.writeFileSync(secFile, 'export function login() {}\n');

      const finding: Finding = {
        id: 'sec-issue-1',
        ruleId: 'SEC-002',
        title: 'Validate input boundary',
        message: 'Input parameter not validated',
        severity: 'error',
        category: 'security',
        filePath: secFile,
        location: {
          filePath: secFile,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 },
        },
        why: 'Malformed inputs can cause crashes or injection attacks.',
        fix: 'manual' as any,
      };

      findingStore.setFindingsForFile(secFile, [finding]);
      findingStore.setSelectedIssueId('sec-issue-1');

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: tempDir } as any,
        findingStore,
        storageManager,
        configManager,
        undefined,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );

      const html = panel.renderHtml();

      // No automatic fix indicators
      expect(html).toContain('No automatic fix');
      expect(html).toContain('View Suggested Fix');
      expect(html).toContain('class="toggle-pill disabled" disabled');
      expect(html).toContain('no-fix-explanation-panel');
      expect(html).toContain('Why this matters');
      expect(html).toContain('Recommended approach');
      expect(html).toContain('Verification steps');
      expect(html).toContain('View Guidance in suggestions.md');
    });

    it('renders all location links when an issue affects multiple instances', () => {
      const fileA = path.join(tempDir, 'ComponentA.tsx');
      const fileB = path.join(tempDir, 'ComponentB.tsx');
      fs.writeFileSync(fileA, '// File A\n');
      fs.writeFileSync(fileB, '// File B\n');

      const multiLocFinding: Finding = {
        id: 'multi-loc-issue',
        ruleId: 'A11Y-001',
        title: 'Missing aria-label on interactive element',
        message: 'Buttons lack accessible names',
        severity: 'warning',
        category: 'accessibility',
        filePath: fileA,
        instances: [
          { filePath: fileA, line: 12, startLine: 12, message: 'Button A has no aria-label' },
          { filePath: fileB, line: 45, startLine: 45, message: 'Button B has no aria-label' },
        ],
      };

      findingStore.setFindingsForFile(fileA, [multiLocFinding]);
      findingStore.setSelectedIssueId('multi-loc-issue');

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: tempDir } as any,
        findingStore,
        storageManager,
        configManager,
        undefined,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );

      const html = panel.renderHtml();

      expect(html).toContain('ComponentA.tsx');
      expect(html).toContain('ComponentB.tsx');
      expect(html).toContain('openFile(');
      expect(html).toContain('12');
      expect(html).toContain('45');
    });

    it('renders responsive dynamic KPI cards and category progress bars', () => {
      const file = path.join(tempDir, 'code.ts');
      fs.writeFileSync(file, '// code\n');

      const findings = [
        {
          id: 'f1',
          ruleId: 'SEC-01',
          title: 'Sec Issue',
          message: 'Security',
          severity: 'error' as const,
          category: 'security',
          filePath: file,
        },
        {
          id: 'f2',
          ruleId: 'UI-01',
          title: 'UI Issue',
          message: 'UI token',
          severity: 'warning' as const,
          category: 'ui',
          filePath: file,
        },
      ];
      findingStore.setFindingsForFile(file, findings);

      const panel = ProjectOverviewPanel.createOrShow(
        { fsPath: tempDir } as any,
        findingStore,
        storageManager,
        configManager,
        undefined,
        createDefaultProjectContext(tempDir),
        undefined,
        undefined,
        undefined,
        changeManager,
        verificationEngine
      );

      const html = panel.renderHtml();

      expect(html).toContain('Overall Quality');
      expect(html).toContain('Open Issues');
      expect(html).toContain('Resolved');
      expect(html).toContain('Security');
      expect(html).toContain('Checklist');
      expect(html).toContain('Changes');
      expect(html).toContain('Category Progress');
      expect(html).toContain('UI / UX');
      expect(html).toContain('Security');
      expect(html).toContain('Code Quality');
      expect(html).toContain('Accessibility');
    });
  });

  describe('4. Permanent Regression Test: Safe CSS Token Replacement', () => {
    it('replaces hex color with var(--color-accent) safely without breaking CSS syntax', () => {
      const cssPath = path.join(tempDir, 'theme.css');
      const cssContent = `.card {\n  background: #ffffff;\n  color: #38bdf8;\n  border-radius: 8px;\n}\n`;
      fs.writeFileSync(cssPath, cssContent);

      const tokenFinding: Finding = {
        id: 'token-reg-issue',
        ruleId: 'UI-TOKEN-001',
        title: 'Use design tokens',
        message: 'Hardcoded color #38bdf8 found',
        severity: 'warning',
        category: 'ui',
        filePath: cssPath,
        location: {
          filePath: cssPath,
          start: { line: 3, column: 10 },
          end: { line: 3, column: 17 },
        },
        suggestions: [
          {
            id: 'sug-token',
            title: 'Use design token',
            explanation: 'Replace #38bdf8 with var(--color-accent)',
            replacement: 'var(--color-accent)',
            patch: 'var(--color-accent)',
            safe: true,
            type: 'autofix',
            range: { startLine: 3, startColumn: 10, endLine: 3, endColumn: 17 },
          },
        ],
      };

      const change = changeManager.createOrGetProposedChangeForIssue(tokenFinding);
      expect(change).toBeDefined();
      expect(change!.files.length).toBe(1);

      const fileChange = change!.files[0];
      expect(fileChange.newContent).toContain('color: var(--color-accent);');
      expect(fileChange.newContent).not.toContain('color: #38bdf8;');
      expect(fileChange.newContent).not.toContain('--color-accent: #38bdf8; 0%');
      expect(fileChange.newContent).not.toMatch(/^\s*var\(--color-accent\);/m);

      // Verify that the resulting CSS parses cleanly through UniversalFixValidator
      const syntaxValidation = UniversalFixValidator.validatePatch(change!, tempDir);
      expect(syntaxValidation.valid).toBe(true);
      expect(syntaxValidation.failures).toHaveLength(0);
    });
  });
});
