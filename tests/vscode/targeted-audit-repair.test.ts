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
      openTextDocument: vi.fn(async (uri: any) => ({
        save: vi.fn(async () => true),
        getText: vi.fn(() => ''),
        version: 1,
        uri,
      })),
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
  IssueRegistry,
  reconcileIssues,
  findingToIssue,
  issueToFinding,
} from '@craftlens/core';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { CraftLensDetailViewProvider } from '../../apps/vscode-extension/src/sidebar/detail-panel-provider.js';

describe('Targeted Audit UX, Fix Suggestions & Security Section Repair', () => {
  let tempDir: string;
  let findingStore: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let sidebarProvider: CraftLensSidebarProvider;
  let mockWebviewView: any;
  let messageHandlers: Map<string, (msg: any) => any>;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = path.join(__dirname, `../tmp-audit-repair-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    messageHandlers = new Map();
    findingStore = new FindingStore();
    storageManager = new AuditStorageManager(tempDir);
    configManager = new ConfigurationManager();

    sidebarProvider = new CraftLensSidebarProvider(
      findingStore,
      storageManager,
      configManager,
      undefined,
      createDefaultProjectContext()
    );

    mockWebviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: vi.fn((handler: (msg: any) => any) => {
          messageHandlers.set('default', handler);
          return { dispose: vi.fn() };
        }),
        postMessage: vi.fn(),
      },
      show: vi.fn(),
      onDidChangeVisibility: vi.fn(),
    };

    sidebarProvider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  describe('1. Top Audit Actions', () => {
    it('removes duplicate actions under Audit tab and keeps actions in top CraftLens header', () => {
      const html = mockWebviewView.webview.html;

      // Duplicate actions below the tab row are removed
      expect(html).not.toContain('class="audit-top-actions"');
      expect(html).not.toContain('class="audit-action-btn"');

      // Top CraftLens header has clean overview action without redundant top-icon-btns
      expect(html).not.toContain('class="top-icon-btn" onclick="runAudit()"');
      expect(html).not.toContain('class="top-icon-btn" onclick="openMasterChecklist()"');
      expect(html).toContain('class="project-overview-btn"');

      // Old text buttons are absent
      expect(html).not.toContain('CraftLens: Run Audit');
      expect(html).not.toContain('CraftLens: Open Master Audit Checklist');
    });

    it('verifies package.json command contributions have $(refresh) and $(checklist) icons with exact titles', () => {
      const pkgPath = path.resolve(__dirname, '../../apps/vscode-extension/package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      const runAudit = pkg.contributes.commands.find((c: any) => c.command === 'craftlens.runAudit');
      expect(runAudit).toBeDefined();
      expect(runAudit.title).toBe('Run Audit');
      expect(runAudit.icon).toBe('$(refresh)');

      const masterChecklist = pkg.contributes.commands.find((c: any) => c.command === 'craftlens.openMasterChecklist');
      expect(masterChecklist).toBeDefined();
      expect(masterChecklist.title).toBe('Open Master Audit Checklist');
      expect(masterChecklist.icon).toBe('$(checklist)');

      const openProblems = pkg.contributes.commands.find((c: any) => c.command === 'craftlens.openProblems');
      expect(openProblems).toBeDefined();
      expect(openProblems.icon).toBe('$(issues)');

      const refreshSidebar = pkg.contributes.commands.find((c: any) => c.command === 'craftlens.refreshSidebar');
      expect(refreshSidebar).toBeDefined();
      expect(refreshSidebar.icon).toBe('$(sync)');

      // Verify openMasterChecklist is removed from view/title menu actions
      const titleMenus = pkg.contributes.menus['view/title'];
      expect(titleMenus.some((m: any) => m.command === 'craftlens.openMasterChecklist')).toBe(false);
    });
  });

  describe('2. Issue Severity Color Coding and Labels Above Code', () => {
    it('applies red styling to Error/Critical and Security findings and yellow to Suggestion', () => {
      const suggestionFinding: Finding = {
        id: 'sug-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'ui-ux',
        title: 'AI gradient pattern detected',
        location: createLocation('/src/card.tsx', 10, 1),
        evidence: [{ snippet: 'linear-gradient(45deg, #f00, #00f)' }],
      };

      const warningFinding: Finding = {
        id: 'warn-1',
        ruleId: 'CP-007',
        severity: 'warning',
        category: 'ui-ux',
        title: 'Repeated card treatment detected',
        location: createLocation('/src/grid.tsx', 20, 1),
        evidence: [{ snippet: '<div className="card">' }],
      };

      const securityFinding: Finding = {
        id: 'sec-1',
        ruleId: 'SEC-002',
        severity: 'critical',
        category: 'security',
        title: 'Potential XSS vulnerability',
        whatIsWrong: 'Unsanitized user input injected into DOM.',
        whyItMatters: 'An attacker may inject executable scripts into the page.',
        location: createLocation('/src/Profile.tsx', 42, 1),
        evidence: [{ snippet: 'dangerouslySetInnerHTML={{ __html: userInput }}' }],
      };

      findingStore.setFindingsForFile('/src/card.tsx', [suggestionFinding]);
      findingStore.setFindingsForFile('/src/grid.tsx', [warningFinding]);
      findingStore.setFindingsForFile('/src/Profile.tsx', [securityFinding]);

      const html = mockWebviewView.webview.html;

      // Card severity classes
      expect(html).toContain('finding-card  finding--info');
      expect(html).toContain('finding-card  finding--warning');
      expect(html).toContain('finding-card  finding--error finding--security');

      // Title severity classes
      expect(html).toContain('finding-title-text sev-title--info');
      expect(html).toContain('finding-title-text sev-title--warning');
      expect(html).toContain('finding-title-text sev-title--error');

      // CSS rule checks for color mapping
      expect(html).toContain('.finding--error .finding-title-text,');
      expect(html).toContain('.finding--security .finding-title-text');
      expect(html).toContain('color: var(--sev-error, var(--status-error));');

      expect(html).toContain('.finding--warning .finding-title-text');
      expect(html).toContain('color: var(--sev-warning, var(--status-warning));');

      expect(html).toContain('.finding--suggestion .finding-title-text');
      expect(html).toContain('color: var(--sev-info, var(--color-accent));');
    });

    it('colors code highlights in sync with parent card severity classes', () => {
      const html = mockWebviewView.webview.html;

      expect(html).toContain('.finding--error .code-snippet-box');
      expect(html).toContain('border: 1px solid rgba(239, 68, 68, 0.35);');
      expect(html).toContain('border-left: 3px solid var(--sev-error, var(--status-error));');
      expect(html).toContain('background: rgba(239, 68, 68, 0.06);');

      expect(html).toContain('.finding--warning .code-snippet-box');
      expect(html).toContain('border: 1px solid rgba(249, 115, 22, 0.35);');
      expect(html).toContain('border-left: 3px solid var(--sev-warning, var(--status-warning));');

      expect(html).toContain('.finding--suggestion .code-snippet-box');
      expect(html).toContain('border-left: 3px solid var(--sev-info, var(--color-accent));');
    });
  });

  describe('3. Fix Suggestion Pipeline & Intermittent Bug Prevention', () => {
    it('prevents reconciliation from wiping out existing suggestions on subsequent scans', () => {
      const existingFinding: Finding = {
        id: 'fix-bug-test',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'ui-ux',
        title: 'AI gradient pattern',
        location: createLocation('/src/banner.tsx', 5, 1),
        suggestions: [
          {
            id: 'sug-1',
            title: 'Use solid surface token',
            explanation: 'Replace gradient with solid color',
            safe: true,
            replacement: 'var(--surface-primary)',
          },
        ],
      };

      const existingIssue = findingToIssue(existingFinding, '/test');
      expect(existingIssue.suggestions?.length).toBe(1);

      // Re-scan finding comes in with empty suggestions (e.g. from fast AST parser)
      const incomingFinding: Finding = {
        ...existingFinding,
        suggestions: [],
      };
      const incomingIssue = findingToIssue(incomingFinding, '/test');

      const result = reconcileIssues(
        [existingIssue],
        [incomingIssue],
        { type: 'file', filePath: '/src/banner.tsx' },
        '/test'
      );

      // Verify suggestions were preserved and NOT wiped out by empty array
      expect(result.unmodified.length + result.updated.length).toBe(1);
      const reconciled = result.unmodified[0] || result.updated[0];
      expect(reconciled.suggestions).toBeDefined();
      expect(reconciled.suggestions!.length).toBe(1);
      expect(reconciled.suggestions![0].title).toBe('Use solid surface token');
    });

    it('displays Suggested Fix preview alongside [Apply Fix] and [Reject] buttons', () => {
      const fixableFinding: Finding = {
        id: 'fixable-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'ui-ux',
        title: 'AI gradient pattern detected',
        whatIsWrong: 'Visual surface styling is too aggressive.',
        location: createLocation('/src/badge.tsx', 8, 1),
        evidence: [{ snippet: 'linear-gradient(45deg, #f00, #00f)' }],
        suggestions: [
          {
            id: 'sug-1',
            title: 'Use surface token',
            explanation: 'Replace the gradient with a restrained solid/surface treatment',
            safe: true,
            replacement: 'var(--surface)',
          },
        ],
      };

      findingStore.setFindingsForFile('/src/badge.tsx', [fixableFinding]);
      const html = mockWebviewView.webview.html;

      expect(html).toContain('class="finding-fix-preview"');
      expect(html).toContain('Suggested Fix:');
      expect(html).toContain('Replace the gradient with a restrained solid/surface treatment');

      expect(html).toContain('class="btn btn-primary fix-action-btn"');
      expect(html).toContain('Apply Fix');

      expect(html).toContain('class="btn btn-quiet reject-action-btn"');
      expect(html).toContain('Reject');
    });

    it('reject action marks issue rejected in registry without mutating source', async () => {
      const finding: Finding = {
        id: 'reject-test-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'ui-ux',
        title: 'Sample finding for reject',
        location: createLocation('/src/header.tsx', 12, 1),
      };

      findingStore.setFindingsForFile('/src/header.tsx', [finding]);

      const handler = messageHandlers.get('default');
      expect(handler).toBeDefined();

      await handler!({ type: 'rejectFinding', findingId: 'reject-test-1' });

      // Verification: command craftlens.rejectFinding was executed
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'craftlens.rejectFinding',
        expect.anything()
      );
    });
  });

  describe('4. Dedicated Security Section in Audit Tab', () => {
    it('surfaces security findings in dedicated Security section with Red treatment', () => {
      const secFinding: Finding = {
        id: 'sec-audit-1',
        ruleId: 'SEC-001',
        severity: 'critical',
        category: 'security',
        title: 'Exposed secret detected in assignment',
        whatIsWrong: 'Source code contains an exposed plaintext API key or credential.',
        whyItMatters: 'Plaintext credentials in source control can be extracted by any tool or collaborator.',
        howToFix: 'Extract credential to environment variable and rotate this secret immediately.',
        location: createLocation('/src/config/secrets.ts', 15, 1),
        evidence: [{ snippet: 'const API_KEY = "ghp_1234567890abcdef1234567890abcdef1234"' }],
        suggestions: [
          {
            id: 'sug-sec-1',
            title: 'Use environment variable',
            explanation: 'Move secret to process.env.API_KEY',
            safe: false,
          },
        ],
      };

      findingStore.setFindingsForFile('/src/config/secrets.ts', [secFinding]);
      const html = mockWebviewView.webview.html;

      // Security Section exists
      expect(html).toContain('class="cat-group security-audit-section"');
      expect(html).toContain('class="cat-header security-cat-header"');
      expect(html).toContain('Security');

      // Security finding badge is SECURITY with red styling
      expect(html).toContain('sev-badge error');
      expect(html).toContain('SECURITY');

      // Why it matters is clearly communicated
      expect(html).toContain('class="security-why-matters"');
      expect(html).toContain('Plaintext credentials in source control can be extracted');

      // Sensitive credential values are masked in snippet
      expect(html).not.toContain('ghp_1234567890abcdef1234567890abcdef1234');
      expect(html).toContain('ghp_••••••••••••••••••••••••••••••••1234');
    });

    it('renders clean empty state when zero security vulnerabilities are present', () => {
      const uiFinding: Finding = {
        id: 'ui-only-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'ui-ux',
        title: 'Visual alignment issue',
        location: createLocation('/src/button.tsx', 10, 1),
      };

      findingStore.setFindingsForFile('/src/button.tsx', [uiFinding]);
      const html = mockWebviewView.webview.html;

      expect(html).toContain('class="cat-group security-audit-section"');
      expect(html).toContain('No security vulnerabilities detected.');
    });
  });

  describe('5. Collapsible Accordion Sections with Chevron Indicators', () => {
    it('renders chevron indicators and live issue counts on section headers', () => {
      const uiFinding: Finding = {
        id: 'ui-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'ui-ux',
        title: 'Alignment flaw',
        location: createLocation('/src/nav.tsx', 12, 1),
      };
      const secFinding: Finding = {
        id: 'sec-1',
        ruleId: 'SEC-001',
        severity: 'critical',
        category: 'security',
        title: 'Hardcoded token',
        location: createLocation('/src/auth.ts', 5, 1),
      };

      findingStore.setFindingsForFile('/src/nav.tsx', [uiFinding]);
      findingStore.setFindingsForFile('/src/auth.ts', [secFinding]);

      const html = mockWebviewView.webview.html;

      // Both UI / UX and Security have chevron indicators
      expect(html).toContain('<span class="cat-chevron">⌄</span>');
      // Live category badges with issue counts
      expect(html).toContain('<span class="cat-badge" style="">1</span>'); // UI / UX count
      expect(html).toContain('<span class="cat-badge" style="background: rgba(239, 68, 68, 0.2); color: var(--status-error); border: 1px solid rgba(239, 68, 68, 0.4);">1</span>'); // Security count

      // Category body wraps findings for accordion collapsing
      expect(html).toContain('<div class="cat-body">');

      // Chevron and title middle alignment styles
      expect(html).toContain('.cat-header-title {');
      expect(html).toContain('display: inline-flex;');
      expect(html).toContain('align-items: center;');
      expect(html).toContain('.cat-chevron {');
      expect(html).toContain('vertical-align: middle;');
    });

    it('toggles category expansion on toggleCategory message without modifying finding store', async () => {
      const uiFinding: Finding = {
        id: 'ui-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'ui-ux',
        title: 'Alignment flaw',
        location: createLocation('/src/nav.tsx', 12, 1),
      };

      findingStore.setFindingsForFile('/src/nav.tsx', [uiFinding]);
      let html = mockWebviewView.webview.html;
      expect(html).toContain('Alignment flaw');

      const handler = messageHandlers.get('default')!;
      // Collapse UI / UX category
      await handler({ type: 'toggleCategory', category: 'ui-ux' });

      html = mockWebviewView.webview.html;
      // Chevron changes to collapsed indicator ›
      expect(html).toContain('<span class="cat-chevron">›</span>');
      // Issue card is collapsed (hidden from presentation)
      expect(html).not.toContain('Alignment flaw');
      // But live badge count remains visible on the header
      expect(html).toContain('<span class="cat-badge" style="">1</span>');

      // Expand UI / UX category back
      await handler({ type: 'toggleCategory', category: 'ui-ux' });
      html = mockWebviewView.webview.html;
      expect(html).toContain('<span class="cat-chevron">⌄</span>');
      expect(html).toContain('Alignment flaw');
    });
  });

  describe('6. Clickable Issue Title & Multi-File Location Navigation', () => {
    it('makes issue title clickable and dispatches openInstance to open code', async () => {
      const finding: Finding = {
        id: 'nav-test-1',
        ruleId: 'UI-001',
        severity: 'error',
        category: 'ui-ux',
        title: 'Strong template-like visual pattern',
        location: createLocation('/src/index.html', 69, 1),
      };

      findingStore.setFindingsForFile('/src/index.html', [finding]);
      const html = mockWebviewView.webview.html;

      // Title row has clickable attributes and openInstance onclick handler
      expect(html).toContain('onclick="openInstance(\'nav-test-1\', 0, \'/src/index.html\', 69, event)"');
      expect(html).toContain('class="finding-title-text sev-title--error clickable-title"');
      expect(html).toContain('Strong template-like visual pattern');

      // Clicking title sends openInstance message
      const handler = messageHandlers.get('default')!;
      await handler({
        type: 'openInstance',
        findingId: 'nav-test-1',
        instanceIndex: 0,
        filePath: '/src/index.html',
        line: 69,
      });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'craftlens.openFindingLocation',
        expect.objectContaining({ id: 'nav-test-1' }),
        0
      );
    });

    it('renders stacked list of multiple file locations below title when multiple instances exist', () => {
      const multiFinding: Finding = {
        id: 'multi-file-1',
        ruleId: 'CP-007',
        severity: 'warning',
        category: 'ui-ux',
        title: 'Repeated Card Treatment',
        location: createLocation('/src/pages/home.tsx', 121, 1),
        instances: [
          { filePath: '/src/pages/home.tsx', line: 121 },
          { filePath: '/src/components/Card.tsx', line: 42 },
          { filePath: '/src/components/ProductCard.tsx', line: 18 },
        ] as any,
      };

      findingStore.setFindingsForFile('/src/pages/home.tsx', [multiFinding]);
      const html = mockWebviewView.webview.html;

      // Single location on top-right is absent
      expect(html).not.toContain('class="finding-location-single"');

      // Stacked list container is present
      expect(html).toContain('class="finding-locations-stacked"');
      expect(html).toContain('onclick="openInstance(\'multi-file-1\', 0, \'/src/pages/home.tsx\', 121, event)"');
      expect(html).toContain('onclick="openInstance(\'multi-file-1\', 1, \'/src/components/Card.tsx\', 42, event)"');
      expect(html).toContain('onclick="openInstance(\'multi-file-1\', 2, \'/src/components/ProductCard.tsx\', 18, event)"');
    });
  });

  describe('7. Suggested Fix vs Automatic Fix Separation in Issue Card', () => {
    it('shows clickable recommendation opening bottom panel when remediation exists without automatic fix', () => {
      const manualFinding: Finding = {
        id: 'remed-1',
        ruleId: 'UI-008',
        severity: 'warning',
        category: 'ui-ux',
        title: 'Repeated Card Spacing',
        whatIsWrong: 'Card spacing is inconsistent across cards.',
        whyItMatters: 'Creates visual noise and breaks grid alignment.',
        howToFix: 'Normalize card spacing using the existing card component and project spacing token.',
        location: createLocation('/src/grid.tsx', 30, 1),
      };

      findingStore.setFindingsForFile('/src/grid.tsx', [manualFinding]);
      const html = mockWebviewView.webview.html;

      // Shows Suggested Fix above code
      expect(html).toContain('class="finding-fix-preview clickable-fix-preview"');
      expect(html).toContain('Suggested Fix:');
      expect(html).toContain('Normalize card spacing using the existing card component and project spacing token.');

      // Recommendation is clickable to show detail panel
      expect(html).toContain('onclick="showFindingDetail(\'remed-1\', event)"');

      // Crucial: never shows "No automatic fix available" button!
      expect(html).not.toContain('No automatic fix available');
      // No Apply Fix button since automatic fix is not available
      expect(html).not.toContain('Apply Fix');
      // Reject button remains available
      expect(html).toContain('Reject');
    });

    it('shows actionable [Apply Fix] when automatic fix exists', () => {
      const autofixFinding: Finding = {
        id: 'auto-1',
        ruleId: 'UI-001',
        severity: 'suggestion',
        category: 'ui-ux',
        title: 'Unrestrained gradient',
        location: createLocation('/src/hero.tsx', 15, 1),
        suggestions: [
          {
            id: 'sug-auto',
            title: 'Use solid surface token',
            explanation: 'Replace gradient with var(--surface-bg)',
            safe: true,
            replacement: 'var(--surface-bg)',
          },
        ],
      };

      findingStore.setFindingsForFile('/src/hero.tsx', [autofixFinding]);
      const html = mockWebviewView.webview.html;

      // Fix preview card with Apply Fix button
      expect(html).toContain('class="finding-fix-preview"');
      expect(html).toContain('class="btn btn-primary fix-action-btn"');
      expect(html).toContain('Apply Fix');
      expect(html).toContain('Reject');
      expect(html).not.toContain('No automatic fix available');
    });
  });

  describe('8. Bottom Detail Panel Layout (Sections 12, 13, 14)', () => {
    let detailPanelProvider: CraftLensDetailViewProvider;
    let mockDetailWebviewView: any;

    beforeEach(() => {
      detailPanelProvider = new CraftLensDetailViewProvider(vscode.Uri.file(tempDir));
      mockDetailWebviewView = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
          postMessage: vi.fn(),
        },
        show: vi.fn(),
      };
      detailPanelProvider.resolveWebviewView(mockDetailWebviewView, {} as any, {} as any);
    });

    it('renders Suggested Fix, Why it matters, Skill, Evidence, and Automatic fix (Not available) for non-automatic finding', () => {
      const nonAutoFinding: Finding = {
        id: 'detail-manual-1',
        ruleId: 'UI-SPACING-01',
        severity: 'warning',
        category: 'ui-ux',
        title: 'Repeated Card Treatment',
        whatIsWrong: 'Card spacing is inconsistent.',
        whyItMatters: 'The repeated spacing pattern creates inconsistent visual rhythm and makes the interface feel less intentional.',
        howToFix: 'Normalize card spacing using the existing card component and project spacing token.',
        location: createLocation('/src/components/Card.tsx', 42, 1),
        evidence: [{ explanation: '27 similar cards detected in this section.' }],
      };

      detailPanelProvider.showFinding(nonAutoFinding);
      const html = mockDetailWebviewView.webview.html;

      // 1. Suggested Fix
      expect(html).toContain('<div class="section-title">Suggested Fix</div>');
      expect(html).toContain('Normalize card spacing using the existing card component and project spacing token.');

      // 2. Why it matters
      expect(html).toContain('<div class="section-title">Why It Matters</div>');
      expect(html).toContain('The repeated spacing pattern creates inconsistent visual rhythm');

      // 3. Skill
      expect(html).toContain('<div class="section-title">Skill</div>');
      expect(html).toContain('UI / UX Quality');

      // 4. Evidence
      expect(html).toContain('<div class="section-title">Evidence</div>');
      expect(html).toContain('27 similar cards detected in this section.');

      // 5. Automatic fix status
      expect(html).toContain('<div class="section-title">Automatic Fix</div>');
      expect(html).toContain('Not available');
      // No duplicate "No automatic fix available" card
      expect(html).not.toContain('No automatic fix available');
    });

    it('renders Automatic fix (Available) with [Preview Change] and [Apply Fix] buttons for fixable finding', () => {
      const autoFinding: Finding = {
        id: 'detail-auto-1',
        ruleId: 'SEC-002',
        severity: 'critical',
        category: 'security',
        title: 'Potential XSS vulnerability',
        whatIsWrong: 'User-controlled content is rendered without appropriate protection.',
        whyItMatters: 'Malicious scripts could execute in users browsers.',
        howToFix: 'Use the existing safe rendering mechanism.',
        location: createLocation('/src/components/Profile.tsx', 42, 1),
        evidence: [{ snippet: 'dangerouslySetInnerHTML' }],
        suggestions: [
          {
            id: 'xss-fix-1',
            title: 'Sanitize HTML output',
            explanation: 'Escape content before rendering',
            safe: true,
            replacement: 'DOMPurify.sanitize(userInput)',
          },
        ],
      };

      detailPanelProvider.showFinding(autoFinding);
      const html = mockDetailWebviewView.webview.html;

      // 1. Suggested Fix
      expect(html).toContain('<div class="section-title">Suggested Fix</div>');
      expect(html).toContain('Use the existing safe rendering mechanism.');

      // 2. Skill for security finding
      expect(html).toContain('<div class="section-title">Skill</div>');
      expect(html).toContain('Security Best Practices');

      // 3. Automatic fix status: Available
      expect(html).toContain('<div class="section-title">Automatic Fix</div>');
      expect(html).toContain('Available');
      expect(html).toContain('onclick="previewFix()">Preview Change</button>');
      expect(html).toContain('onclick="applyFix()">Apply Fix</button>');
    });
  });
});
