import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showOpenDialog: vi.fn(),
      showInputBox: vi.fn(),
      createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
      createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() })),
    },
    commands: {
      executeCommand: vi.fn(),
      registerCommand: vi.fn(),
    },
    workspace: {
      workspaceFolders: [],
      registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultVal: any) => defaultVal ?? []),
        update: vi.fn(),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
    ThemeColor: class {},
    Range: class {},
    Position: class {},
    Uri: {
      file: (f: string) => ({ fsPath: f, scheme: 'file', path: f }),
    },
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
  SkillDiscoveryService,
  SkillManager,
  UserRuleManager,
  Skill,
  FindingStore,
  AuditStorageManager,
  createDefaultProjectContext,
} from '@craftlens/core';
import { RuleRegistry, RuleEngine } from '@craftlens/rule-engine';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { CraftLensDetailViewProvider } from '../../apps/vscode-extension/src/sidebar/detail-panel-provider.js';
import { CommandManager } from '../../apps/vscode-extension/src/commands/command-manager.js';

describe('Security Audit Hardening Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftlens-security-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Path Traversal Prevention in Skills', () => {
    it('blocks path traversal attempts in SkillDiscoveryService.installSkill', async () => {
      const discovery = new SkillDiscoveryService();
      const maliciousSkill: Skill = {
        id: '../../traversal-skill',
        name: 'Malicious Skill',
        description: 'Attempts to write outside .craftlens/skills',
        source: 'github',
        installed: false,
        active: false,
        status: 'available',
      };

      const result = await discovery.installSkill(maliciousSkill, {
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(true);
      const installedPath = result.skill.path!;
      const expectedSkillsDir = path.resolve(tempDir, '.craftlens', 'skills');
      expect(installedPath.startsWith(expectedSkillsDir)).toBe(true);
      expect(path.relative(expectedSkillsDir, installedPath).startsWith('..')).toBe(false);
      expect(fs.existsSync(installedPath)).toBe(true);
    });

    it('rejects completely invalid/empty skill IDs in installSkill', async () => {
      const discovery = new SkillDiscoveryService();
      const invalidSkill: Skill = {
        id: '../..///',
        name: 'Invalid Skill',
        description: 'Empty sanitized id',
        source: 'github',
        installed: false,
        active: false,
        status: 'available',
      };

      const result = await discovery.installSkill(invalidSkill, { workspaceRoot: tempDir });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid skill ID');
    });

    it('prevents directory traversal deletion in SkillManager.deleteSkill', async () => {
      const manager = new SkillManager(tempDir);
      const targetOutsideFile = path.resolve(tempDir, 'outside-secret.md');
      fs.writeFileSync(targetOutsideFile, '# Secret File', 'utf-8');

      const deleted = await manager.deleteSkill('../../outside-secret');
      expect(deleted).toBe(false);
      expect(fs.existsSync(targetOutsideFile)).toBe(true);
    });
  });

  describe('SSRF and Payload Limit in UserRuleManager.fetchAndValidateUrl', () => {
    it('blocks localhost and loopback IPv4/IPv6 addresses', async () => {
      const loopbackUrls = [
        'http://localhost:3000/rules.md',
        'http://127.0.0.1:8080/rules.md',
        'http://127.0.0.2:9999/rules.md',
        'http://[::1]:8080/rules.md',
        'http://subdomain.localhost/rules.md',
      ];

      for (const url of loopbackUrls) {
        const result = await UserRuleManager.fetchAndValidateUrl(url);
        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked for security');
      }
    });

    it('blocks cloud metadata endpoints (AWS, GCP, Azure)', async () => {
      const metadataUrls = [
        'http://169.254.169.254/latest/meta-data/',
        'http://metadata.google.internal/computeMetadata/v1/',
      ];

      for (const url of metadataUrls) {
        const result = await UserRuleManager.fetchAndValidateUrl(url);
        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked for security');
      }
    });

    it('blocks private network IP ranges (RFC 1918)', async () => {
      const privateUrls = [
        'http://10.0.0.1/rules.md',
        'http://172.16.0.5/rules.md',
        'http://172.31.255.255/rules.md',
        'http://192.168.1.100/rules.md',
      ];

      for (const url of privateUrls) {
        const result = await UserRuleManager.fetchAndValidateUrl(url);
        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked for security');
      }
    });

    it('rejects unsupported protocols such as file:// and ftp://', async () => {
      const fileResult = await UserRuleManager.fetchAndValidateUrl('file:///etc/passwd');
      expect(fileResult.success).toBe(false);
      expect(fileResult.error).toContain('HTTP and HTTPS');

      const ftpResult = await UserRuleManager.fetchAndValidateUrl('ftp://example.com/rules.md');
      expect(ftpResult.success).toBe(false);
      expect(ftpResult.error).toContain('HTTP and HTTPS');
    });
  });

  describe('Webview Content Security Policy Enforcement', () => {
    it('enforces CSP meta tag with default-src none in SidebarProvider', () => {
      const store = new FindingStore();
      const storage = new AuditStorageManager(tempDir);
      const config = new ConfigurationManager();
      const engine = new RuleEngine(new RuleRegistry());
      const context = createDefaultProjectContext(tempDir);
      const provider = new CraftLensSidebarProvider(store, storage, config, engine, context);
      const html = (provider as any).renderHtml();

      expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
      expect(html).toContain("default-src 'none'");
      expect(html).toContain("style-src 'unsafe-inline'");
      expect(html).toContain("script-src 'unsafe-inline'");
      expect(html).not.toContain("console.log('[CraftLens]");
    });

    it('enforces CSP meta tag in CraftLensDetailViewProvider renderHtml and renderEmptyState', () => {
      const detailProvider = new CraftLensDetailViewProvider({ fsPath: tempDir } as any);
      const emptyHtml = (detailProvider as any).renderEmptyState();
      expect(emptyHtml).toContain('<meta http-equiv="Content-Security-Policy"');
      expect(emptyHtml).toContain("default-src 'none'");

      const dummyFinding: any = {
        ruleId: 'UI-001',
        problemTitle: 'Test Issue',
        whatIsWrong: 'Something is wrong',
        whyItMatters: 'It matters',
        severity: 'warning',
        location: { filePath: 'src/App.tsx', start: { line: 10, column: 1 }, end: { line: 10, column: 20 } },
      };
      (detailProvider as any).currentFinding = dummyFinding;
      const html = (detailProvider as any).renderHtml();
      expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
      expect(html).toContain("default-src 'none'");
    });
  });

  describe('Workspace Boundary Validation in CommandManager', () => {
    it('correctly accepts paths inside the workspace and rejects paths outside', () => {
      const mockProjectContext: any = {
        rootPath: tempDir,
      };
      const mockDiagnostics: any = {
        getFindingStore: () => new FindingStore(),
      };
      const cmdManager = new CommandManager(
        {} as any,
        mockDiagnostics,
        {} as any,
        {} as any,
        {} as any,
        mockProjectContext
      );

      const insideFile = path.join(tempDir, 'src', 'components', 'Button.tsx');
      expect(cmdManager.isInsideWorkspace(insideFile)).toBe(true);

      const outsideFile = path.resolve(tempDir, '..', 'other-dir', 'secret.txt');
      expect(cmdManager.isInsideWorkspace(outsideFile)).toBe(false);

      expect(cmdManager.isInsideWorkspace('/etc/passwd')).toBe(false);
      expect(cmdManager.isInsideWorkspace('')).toBe(false);
    });
  });
});
