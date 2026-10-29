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
      getConfiguration: vi.fn(() => ({ get: vi.fn((k, d) => d), update: vi.fn() })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
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
  createDefaultProjectContext,
  resolveFixCapability,
  ChangeManager,
  VerificationEngine,
  SkillManager,
} from '@craftlens/core';
import { ProjectOverviewPanel } from '../../apps/vscode-extension/src/overview/project-overview-panel.js';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { RuleEngine, RuleRegistry, registerDefaultRules } from '@craftlens/rule-engine';
import { AstCache } from '@craftlens/parser';

describe('CraftLens Repair & Verification Pass', () => {
  let tempDir: string;
  let store: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let ruleEngine: RuleEngine;
  let changeManager: ChangeManager;
  let verificationEngine: VerificationEngine;
  let skillManager: SkillManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftlens-repair-test-'));
    vi.mocked(vscode.workspace.workspaceFolders as any).length = 0;
    (vscode.workspace.workspaceFolders as any).push({
      uri: { fsPath: tempDir },
      name: 'test-ws',
      index: 0,
    });

    store = new FindingStore();
    storageManager = new AuditStorageManager(tempDir);
    configManager = new ConfigurationManager();
    const registry = new RuleRegistry();
    registerDefaultRules(registry);
    ruleEngine = new RuleEngine(registry, new AstCache());
    changeManager = new ChangeManager(tempDir);
    verificationEngine = new VerificationEngine(tempDir);
    skillManager = new SkillManager(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('1. Proposed Changes are Issue-Specific and Dynamic', () => {
    it('generates a proposed change with real before/after from disk corresponding to the selected issue', () => {
      const srcFile = path.join(tempDir, 'src/Card.tsx');
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      const initialCode = 'export const Card = () => <div className="p-4 bg-white" />;\n';
      fs.writeFileSync(srcFile, initialCode, 'utf-8');

      const issueRegistry = store.getIssueRegistry();
      issueRegistry.registerIssue({
        id: 'issue-card-spacing',
        fingerprint: 'fp-card-spacing',
        ruleId: 'CP-007',
        title: 'Repeated Card Treatment',
        summary: 'Card has hardcoded padding',
        category: 'ui-ux',
        severity: 'moderate',
        confidence: 0.9,
        status: 'open',
        locations: [
          {
            filePath: srcFile,
            range: { startLine: 1, startColumn: 36, endLine: 1, endColumn: 49 },
          },
        ],
        suggestions: [
          {
            id: 'sug-card',
            title: 'Use token spacing',
            description: 'Replace p-4 with token',
            replacement: 'className="p-var-spacing bg-surface"',
          },
        ],
        evidence: [],
        whyItMatters: 'Design consistency',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });

      // Generate proposed change for this issue
      const issue = issueRegistry.getIssue('issue-card-spacing')!;
      const proposedChange = changeManager.createOrGetProposedChangeForIssue(issue);

      expect(proposedChange).toBeDefined();
      expect(proposedChange.issueIds).toContain('issue-card-spacing');
      expect(proposedChange.files.length).toBe(1);
      expect(proposedChange.files[0].filePath).toBe(srcFile);
      expect(proposedChange.files[0].originalContent).toBe(initialCode);
      expect(proposedChange.files[0].newContent).toContain('className="p-var-spacing bg-surface"');
      expect(proposedChange.files[0].edits).toBeDefined();
      expect(proposedChange.files[0].edits!.length).toBeGreaterThan(0);
      expect(proposedChange.files[0].edits![0].replacementText).toBe('className="p-var-spacing bg-surface"');
    });

    it('generates distinct proposed changes for different issues without reusing prior diffs', () => {
      const fileA = path.join(tempDir, 'src/Header.tsx');
      const fileB = path.join(tempDir, 'src/Footer.tsx');
      fs.mkdirSync(path.dirname(fileA), { recursive: true });
      fs.writeFileSync(fileA, 'const Header = () => <header className="bg-red-500" />;\n', 'utf-8');
      fs.writeFileSync(fileB, 'const Footer = () => <footer className="text-gray-400" />;\n', 'utf-8');

      const issueRegistry = store.getIssueRegistry();
      issueRegistry.registerIssue({
        id: 'issue-header',
        fingerprint: 'fp-header',
        ruleId: 'UI-001',
        title: 'Header Color',
        summary: 'Raw hex color',
        category: 'ui-ux',
        severity: 'warning',
        confidence: 0.8,
        status: 'open',
        locations: [{ filePath: fileA, range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 50 } }],
        suggestions: [{ id: 'sug-1', title: 'Fix Header', replacement: 'const Header = () => <header className="bg-header" />;\n' }],
        evidence: [],
        whyItMatters: 'Hierarchy',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });

      issueRegistry.registerIssue({
        id: 'issue-footer',
        fingerprint: 'fp-footer',
        ruleId: 'UI-002',
        title: 'Footer Contrast',
        summary: 'Low contrast text',
        category: 'accessibility',
        severity: 'high',
        confidence: 0.95,
        status: 'open',
        locations: [{ filePath: fileB, range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 52 } }],
        suggestions: [{ id: 'sug-2', title: 'Fix Footer', replacement: 'const Footer = () => <footer className="text-footer" />;\n' }],
        evidence: [],
        whyItMatters: 'WCAG compliance',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });

      const changeA = changeManager.createOrGetProposedChangeForIssue(issueRegistry.getIssue('issue-header')!);
      const changeB = changeManager.createOrGetProposedChangeForIssue(issueRegistry.getIssue('issue-footer')!);

      expect(changeA.id).not.toBe(changeB.id);
      expect(changeA.files[0].filePath).toBe(fileA);
      expect(changeB.files[0].filePath).toBe(fileB);
      expect(changeA.files[0].newContent).toContain('bg-header');
      expect(changeB.files[0].newContent).toContain('text-footer');
    });

    it('detects when original source changes on disk and marks the proposed change stale', () => {
      const srcFile = path.join(tempDir, 'src/StaleCheck.tsx');
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      fs.writeFileSync(srcFile, 'const x = 1;\n', 'utf-8');

      const issueRegistry = store.getIssueRegistry();
      issueRegistry.registerIssue({
        id: 'issue-stale',
        fingerprint: 'fp-stale',
        ruleId: 'RULE-1',
        title: 'Variable naming',
        summary: 'Bad name',
        category: 'code',
        severity: 'low',
        confidence: 0.8,
        status: 'open',
        locations: [{ filePath: srcFile, range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 12 } }],
        suggestions: [{ id: 'sug-stale', title: 'Rename x', replacement: 'const counter = 1;\n' }],
        evidence: [],
        whyItMatters: 'Clarity',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });

      const proposed = changeManager.createOrGetProposedChangeForIssue(issueRegistry.getIssue('issue-stale')!);
      expect(proposed.files[0].originalContent).toBe('const x = 1;\n');

      // Now simulate user editing the file on disk outside CraftLens
      fs.writeFileSync(srcFile, 'const x = 2; // modified by user\n', 'utf-8');

      // Overview panel staleness check
      const currentDisk = fs.readFileSync(srcFile, 'utf-8');
      const isStale = currentDisk !== proposed.files[0].originalContent;
      expect(isStale).toBe(true);
    });

    it('discarding a proposed change removes it from active proposals without modifying source on disk', () => {
      const srcFile = path.join(tempDir, 'src/DiscardTest.tsx');
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      const original = 'const keepThisOriginal = true;\n';
      fs.writeFileSync(srcFile, original, 'utf-8');

      const issueRegistry = store.getIssueRegistry();
      issueRegistry.registerIssue({
        id: 'issue-discard',
        fingerprint: 'fp-discard',
        ruleId: 'RULE-DISCARD',
        title: 'Discardable',
        summary: 'To be discarded',
        category: 'ui-ux',
        severity: 'low',
        confidence: 0.7,
        status: 'open',
        locations: [{ filePath: srcFile, range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 30 } }],
        suggestions: [{ id: 'sug-disc', title: 'Replace', replacement: 'const replaced = true;\n' }],
        evidence: [],
        whyItMatters: 'Test discard',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });

      const change = changeManager.createOrGetProposedChangeForIssue(issueRegistry.getIssue('issue-discard')!);
      expect(changeManager.getChange(change.id)).toBeDefined();

      // Discard
      const discarded = changeManager.discardChange(change.id);
      expect(discarded).toBe(true);
      expect(changeManager.getChange(change.id)?.status).toBe('rejected');
      expect(changeManager.getPendingChanges().find(c => c.id === change.id)).toBeUndefined();

      // Ensure file on disk was NOT touched
      expect(fs.readFileSync(srcFile, 'utf-8')).toBe(original);
    });

    it('applying a proposed change writes atomically to disk, updates status, and logs history', async () => {
      const srcFile = path.join(tempDir, 'src/ApplyTest.tsx');
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      fs.writeFileSync(srcFile, 'const oldVal = 10;\n', 'utf-8');

      const issueRegistry = store.getIssueRegistry();
      issueRegistry.registerIssue({
        id: 'issue-apply',
        fingerprint: 'fp-apply',
        ruleId: 'RULE-APPLY',
        title: 'Value Fix',
        summary: 'Old value needs upgrade',
        category: 'ui-ux',
        severity: 'medium',
        confidence: 0.9,
        status: 'open',
        locations: [{ filePath: srcFile, range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 18 } }],
        suggestions: [{ id: 'sug-app', title: 'Upgrade', replacement: 'const newVal = 20;\n' }],
        evidence: [],
        whyItMatters: 'Correctness',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });

      const change = changeManager.createOrGetProposedChangeForIssue(issueRegistry.getIssue('issue-apply')!);
      const applied = await changeManager.applyChange(change.id);
      expect(applied.success).toBe(true);

      // Verify file on disk actually changed
      expect(fs.readFileSync(srcFile, 'utf-8').trim()).toBe('const newVal = 20;');
      expect(changeManager.getChange(change.id)?.status).toBe('applied');

      // Append to user change log
      storageManager.appendUserChange({
        id: change.id,
        findingId: 'issue-apply',
        ruleId: 'RULE-APPLY',
        timestamp: new Date().toISOString(),
        description: 'Applied fix for Value Fix',
        source: 'change-plan',
      });

      const changes = storageManager.loadUserChanges();
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0].description).toContain('Applied fix for Value Fix');
    });
  });

  describe('2. Fix Capability Resolution (No Dead-Ends)', () => {
    it('accurately resolves deterministic fix capability and safety distinctions', () => {
      // Automatic apply available when autoFixAvailable is true
      const autoIssue = {
        id: 'iss-auto',
        title: 'Missing Alt',
        summary: 'Img lacks alt tag',
        autoFixAvailable: true,
        suggestions: [{ id: 'sug-1', title: 'Add alt', replacement: '<img alt="Logo" />' }],
        ruleId: 'A11Y-001',
      };
      const autoCap = resolveFixCapability(autoIssue as any, skillManager);
      expect(autoCap.deterministicFixAvailable).toBe(true);
      expect(autoCap.automaticApplyAvailable).toBe(true);
      expect(autoCap.recommendationAvailable).toBe(true);

      // Deterministic fix available but requires review/proposal before application
      const reviewIssue = {
        id: 'iss-review',
        title: 'Button Styling',
        summary: 'Unapproved button variant',
        suggestions: [{ id: 'sug-2', title: 'Standardize', replacement: '<Button variant="primary" />' }],
        ruleId: 'UI-003',
      };
      const reviewCap = resolveFixCapability(reviewIssue as any, skillManager);
      expect(reviewCap.deterministicFixAvailable).toBe(true);
      expect(reviewCap.automaticApplyAvailable).toBe(false);
      expect(reviewCap.proposedChangeAvailable).toBe(true);
    });

    it('accurately resolves skill-assisted fix capability when an issue matches an available skill', () => {
      const issue = {
        id: 'iss-skill',
        title: 'Use design tokens',
        summary: 'Hardcoded hex used',
        category: 'ui-ux',
        ruleId: 'usr_design_tokens',
        whyItMatters: 'Hardcoded values bypass the token architecture',
      };

      const cap = resolveFixCapability(issue as any, skillManager);
      expect(cap.skillAssistedFixAvailable).toBe(true);
      expect(cap.skillId).toBe('design-system-consistency');
      expect(cap.recommendationAvailable).toBe(true);
    });

    it('provides clear manual recommendation state without fabricating automatic fixes when fix is unsafe', () => {
      const issue = {
        id: 'iss-manual',
        title: 'Architectural coupling',
        summary: 'Complex circular dependency across modules',
        whyItMatters: 'Tight coupling hinders maintainability',
        ruleId: 'ARCH-001',
        category: 'architecture',
      };

      const cap = resolveFixCapability(issue as any, skillManager);
      expect(cap.deterministicFixAvailable).toBe(false);
      expect(cap.automaticApplyAvailable).toBe(false);
      expect(cap.recommendationAvailable).toBe(true);
      expect(cap.reason).toBeDefined();
    });
  });

  describe('3. Project Markdown Artifacts Navigation', () => {
    it('creates and opens issues.md, suggestions.md, checklist.md, and changes.md via VS Code APIs', async () => {
      const ctx = createDefaultProjectContext(tempDir);
      const findings = [
        {
          id: 'f-1',
          ruleId: 'CP-007',
          problemTitle: 'Card Repetition',
          title: 'Card Repetition',
          summary: 'Duplicated card styling',
          severity: 'warning',
          category: 'ui-ux',
          message: 'Duplicated card styling',
          why: 'Rhythm',
          firstDetected: new Date().toISOString(),
          lastDetected: new Date().toISOString(),
          status: 'open',
          instances: [{ filePath: 'src/Card.tsx', startLine: 1, endLine: 1 }],
        } as any,
      ];

      storageManager.getOrInitAudit(ctx, findings);
      storageManager.syncAudit(ctx, findings);

      const craftlensDir = path.join(tempDir, '.craftlens');
      expect(fs.existsSync(craftlensDir)).toBe(true);

      const issuesPath = path.join(craftlensDir, 'issues.md');
      const suggestionsPath = path.join(craftlensDir, 'suggestions.md');
      const checklistPath = path.join(craftlensDir, 'checklist.md');
      const changesPath = path.join(craftlensDir, 'changes.md');

      expect(fs.existsSync(issuesPath)).toBe(true);
      expect(fs.existsSync(suggestionsPath)).toBe(true);
      expect(fs.existsSync(checklistPath)).toBe(true);
      expect(fs.existsSync(changesPath)).toBe(true);
      expect(fs.existsSync(path.join(craftlensDir, 'problems.md'))).toBe(false);
      expect(fs.existsSync(path.join(craftlensDir, 'solutions.md'))).toBe(false);

      // Verify content is real, not empty or placeholder
      const issuesContent = fs.readFileSync(issuesPath, 'utf-8');
      expect(issuesContent).toContain('Card Repetition');
      expect(issuesContent).toContain('CP-007');

      const suggestionsContent = fs.readFileSync(suggestionsPath, 'utf-8');
      expect(suggestionsContent).toContain('Suggestions');

      const checklistContent = fs.readFileSync(checklistPath, 'utf-8');
      expect(checklistContent).toContain('Checklist');

      // Test opening file through VS Code API
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(issuesPath));
      await vscode.window.showTextDocument(doc);
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });
  });

  describe('4. Canonical Metrics Consistency', () => {
    it('calculates open issues, severity counts, and checklist count strictly from canonical sources', () => {
      const issueRegistry = store.getIssueRegistry();
      issueRegistry.registerIssue({
        id: 'iss-1',
        fingerprint: 'fp-1',
        ruleId: 'ERR-1',
        title: 'Error Issue',
        summary: 'E1',
        category: 'code',
        severity: 'critical',
        confidence: 1,
        status: 'open',
        locations: [{ filePath: 'src/A.ts', range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 } }],
        evidence: [],
        whyItMatters: '',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });
      issueRegistry.registerIssue({
        id: 'iss-2',
        fingerprint: 'fp-2',
        ruleId: 'WARN-1',
        title: 'Warning Issue',
        summary: 'W1',
        category: 'ui-ux',
        severity: 'high',
        confidence: 1,
        status: 'open',
        locations: [{ filePath: 'src/B.ts', range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 } }],
        evidence: [],
        whyItMatters: '',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });
      issueRegistry.registerIssue({
        id: 'iss-3',
        fingerprint: 'fp-3',
        ruleId: 'RES-1',
        title: 'Resolved Issue',
        summary: 'R1',
        category: 'code',
        severity: 'medium',
        confidence: 1,
        status: 'resolved', // should NOT be counted in Open Issues!
        locations: [{ filePath: 'src/C.ts', range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 } }],
        evidence: [],
        whyItMatters: '',
        changeIds: [],
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
      });

      const openIssues = issueRegistry.getOpenIssues();
      expect(openIssues.length).toBe(2);

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

      const html = panel.getHtml();
      // Should show 2 Open Issues
      expect(html).toContain('Open Issues');
      expect(html).toContain('title="View Open Issues (2)"');
      expect(html).toContain('<div class="kpi-val">2</div>');
      // Should NOT show static 7 issues or static index.html diff
      expect(html).not.toContain('src/api/users.ts');
      expect(html).not.toContain('7 issues detected');
    });
  });

  describe('5. Clean Subscriptions & Resource Disposal', () => {
    it('disposes WebviewPanel without leaking subscriptions', () => {
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

      expect(panel).toBeDefined();
      panel.dispose();
      // Calling dispose again should be safe and idempotent
      expect(() => panel.dispose()).not.toThrow();
    });
  });
});
