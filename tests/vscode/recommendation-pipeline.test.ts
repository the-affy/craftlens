import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const registeredCommands = new Map<string, (...args: any[]) => any>();

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
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
      createStatusBarItem: vi.fn(() => ({
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        text: '',
        tooltip: '',
        command: '',
      })),
      showTextDocument: vi.fn(async () => ({})),
      activeTextEditor: undefined,
    },
    commands: {
      executeCommand: vi.fn(async (cmd: string, ...args: any[]) => {
        const handler = registeredCommands.get(cmd);
        if (handler) {
          return handler(...args);
        }
        return undefined;
      }),
      registerCommand: vi.fn((cmd: string, handler: (...args: any[]) => any) => {
        registeredCommands.set(cmd, handler);
        return {
          dispose: () => {
            registeredCommands.delete(cmd);
          },
        };
      }),
    },
    languages: {
      createDiagnosticCollection: vi.fn(() => ({
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    workspace: {
      workspaceFolders: [
        {
          uri: { fsPath: '/mock/workspace' },
          name: 'mock-workspace',
          index: 0,
        },
      ],
      openTextDocument: vi.fn(async (target: any) => {
        const filePath = typeof target === 'string' ? target : target.fsPath;
        const exists = fs.existsSync(filePath);
        const content = exists ? fs.readFileSync(filePath, 'utf-8') : '<div>sample</div>';
        const lines = content.split('\n');
        return {
          uri: typeof target === 'string' ? { fsPath: target } : target,
          getText: (range?: any) => {
            if (!range) return content;
            const startLine = range.startLine ?? range.start?.line ?? 0;
            const endLine = range.endLine ?? range.end?.line ?? lines.length - 1;
            return lines.slice(startLine, endLine + 1).join('\n');
          },
          version: 1,
          lineCount: lines.length,
          positionAt: (offset: number) => {
            let current = 0;
            for (let i = 0; i < lines.length; i++) {
              if (current + lines[i].length + 1 > offset) {
                return { line: i, character: offset - current };
              }
              current += lines[i].length + 1;
            }
            return { line: lines.length - 1, character: 0 };
          },
          offsetAt: (pos: any) => {
            let offset = 0;
            for (let i = 0; i < pos.line && i < lines.length; i++) {
              offset += lines[i].length + 1;
            }
            return offset + (pos.character || 0);
          },
          lineAt: (line: number) => {
            if (line < 0 || line >= lines.length) {
              throw new Error(`Illegal value for line: ${line}`);
            }
            return { text: lines[line] };
          },
          save: vi.fn(async () => true),
        };
      }),
      applyEdit: vi.fn(async (edit: any) => true),
      registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultVal: any) => defaultVal ?? []),
        update: vi.fn(),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
      parse: (s: string) => ({ toString: () => s, fsPath: s }),
    },
    Range: class {
      constructor(public startLine: any, public startCol: any, public endLine?: any, public endCol?: any) {}
    },
    Position: class {
      constructor(public line: number, public character: number) {}
    },
    Location: class {
      constructor(public uri: any, public range: any) {}
    },
    WorkspaceEdit: class {
      public replacements: any[] = [];
      replace(uri: any, range: any, text: string) {
        this.replacements.push({ uri, range, text });
      }
    },
    Diagnostic: class {
      public code: any;
      public source: any;
      public craftLensFinding: any;
      public relatedInformation: any;
      constructor(public range: any, public message: string, public severity: any) {}
    },
    DiagnosticRelatedInformation: class {
      constructor(public location: any, public message: string) {}
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class {},
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
  ProjectContext,
  createDefaultProjectContext,
  normalizeRecommendation,
  validateRecommendation,
  TRANSFORMATION_CAPABILITIES,
  CanonicalRecommendation,
} from '@craftlens/core';
import { RuleRegistry, registerDefaultRules, RuleEngine } from '@craftlens/rule-engine';
import { AstCache } from '@craftlens/parser';
import { FixBuilder } from '@craftlens/design-intelligence';
import { ConfigurationManager } from '../../apps/vscode-extension/src/configuration/config-manager.js';
import { DiagnosticsCollectionAdapter } from '../../apps/vscode-extension/src/diagnostics/collection-adapter.js';
import { CraftLensStatusBar } from '../../apps/vscode-extension/src/status/status-bar.js';
import { CommandManager } from '../../apps/vscode-extension/src/commands/command-manager.js';
import { CraftLensSidebarProvider } from '../../apps/vscode-extension/src/sidebar/sidebar-provider.js';
import { CraftLensDetailViewProvider } from '../../apps/vscode-extension/src/sidebar/detail-panel-provider.js';

describe('CraftLens Recommendation Pipeline & Hardened Apply/Preview Engine', () => {
  let findingStore: FindingStore;
  let storageManager: AuditStorageManager;
  let configManager: ConfigurationManager;
  let diagnosticsAdapter: DiagnosticsCollectionAdapter;
  let engine: RuleEngine;
  let statusBar: CraftLensStatusBar;
  let commandManager: CommandManager;
  let sidebarProvider: CraftLensSidebarProvider;
  let detailPanelProvider: CraftLensDetailViewProvider;
  let projectContext: ProjectContext;
  let tempRoot: string;
  let testFile: string;

  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();

    tempRoot = path.join(process.cwd(), 'dist', 'test-rec-pipeline-' + Math.random().toString(36).substring(7));
    fs.mkdirSync(tempRoot, { recursive: true });
    testFile = path.join(tempRoot, 'Component.tsx');
    fs.writeFileSync(
      testFile,
      `export function Component() {\n  return (\n    <div class="service-box">Service 1</div>\n    <div class="service-box">Service 2</div>\n  );\n}`
    );

    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: tempRoot }, name: 'test', index: 0 },
    ];

    findingStore = new FindingStore();
    storageManager = new AuditStorageManager(tempRoot);
    configManager = new ConfigurationManager();
    diagnosticsAdapter = new DiagnosticsCollectionAdapter(findingStore);
    const registry = new RuleRegistry();
    registerDefaultRules(registry);
    const astCache = new AstCache();
    engine = new RuleEngine(registry, astCache);
    statusBar = new CraftLensStatusBar();
    projectContext = createDefaultProjectContext(tempRoot);

    sidebarProvider = new CraftLensSidebarProvider(
      findingStore,
      storageManager,
      configManager,
      engine,
      projectContext
    );

    detailPanelProvider = new CraftLensDetailViewProvider(
      vscode.Uri.file(tempRoot),
      engine.getSkillManager()
    );

    commandManager = new CommandManager(
      engine,
      diagnosticsAdapter,
      configManager,
      storageManager,
      statusBar,
      projectContext,
      sidebarProvider,
      detailPanelProvider
    );
  });

  describe('Section 1 & 2 & 18: Regression Tests for toUpperCase() and Undefined Data', () => {
    it('never throws Cannot read properties of undefined (reading toUpperCase) during diagnostic creation with untyped evidence', () => {
      const findingWithUntypedEvidence: any = {
        ruleId: 'UI-006',
        message: 'Unpadded card',
        severity: 'warning',
        location: { filePath: testFile, start: { line: 3, column: 5 }, end: { line: 3, column: 25 } },
        evidence: [
          { explanation: 'Evidence without type property' },
          'Simple string evidence item',
          null,
          undefined,
          { snippet: 'snippet only evidence' },
        ],
      };

      expect(() => {
        diagnosticsAdapter.update(vscode.Uri.file(testFile), [findingWithUntypedEvidence]);
      }).not.toThrow();
    });

    it('never throws toUpperCase error when FixBuilder formats a fix with undefined safety', () => {
      const fixWithoutSafety: any = {
        id: 'fix-1',
        title: 'Fix title',
        changes: [],
      };

      expect(() => {
        const preview = FixBuilder.formatBeforeAfterPreview(fixWithoutSafety);
        expect(preview).toContain('ASSISTED');
      }).not.toThrow();
    });

    it('never throws TypeError when recommendation with undefined fields is applied', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const finding: any = {
        ruleId: 'UI-001',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 3, column: 1 }, end: { line: 3, column: 20 } },
      };

      const malformedRec: any = {
        id: undefined,
        title: undefined,
        transformation: undefined,
        evidence: undefined,
        whyItFits: undefined,
      };

      const result = await applyCmd(finding, malformedRec);
      expect(result).toBeDefined();
      expect(result.success).toBe(true); // Gracefully treated as manual guidance
      // Must NOT throw TypeError: Cannot read properties of undefined
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalledWith(
        expect.stringContaining("Cannot read properties of undefined (reading 'toUpperCase')")
      );
    });
  });

  describe('Section 3 & 4: Canonical Recommendation Contract & Normalization', () => {
    it('normalizes raw recommendation into canonical shape', () => {
      const finding: any = {
        id: 'find-101',
        ruleId: 'CP-007',
        category: 'ui',
        message: 'Repeated service card pattern',
        location: { filePath: testFile, start: { line: 3, column: 1 }, end: { line: 4, column: 1 } },
        evidence: [{ explanation: '4 card elements' }],
      };

      const raw = {
        id: 'rec-hierarchize',
        title: '01 Hierarchize Cards',
        transformation: 'hierarchize',
        whyItFits: ['Creates visual order'],
      };

      const canonical = normalizeRecommendation(raw, finding);
      expect(canonical.id).toBe('rec-hierarchize');
      expect(canonical.title).toBe('01 Hierarchize Cards');
      expect(canonical.category).toBe('ui');
      expect(canonical.transformation).toBe('hierarchize');
      expect(canonical.target?.filePath).toBe(testFile);
      expect(canonical.evidence).toEqual(['4 card elements']);
      expect(canonical.fix?.type).toBe('assisted');
    });

    it('validates recommendation data before reaching execution', () => {
      expect(validateRecommendation(null).valid).toBe(false);
      expect(validateRecommendation(undefined).valid).toBe(false);
      expect(validateRecommendation('string-instead-of-object').valid).toBe(false);
      expect(validateRecommendation({ id: '', title: 'Test' }).valid).toBe(false);
      expect(validateRecommendation({ id: 'rec-1', title: '' }).valid).toBe(false);

      const validRec = { id: 'rec-1', title: 'Valid Title', transformation: 'hierarchize' };
      const res = validateRecommendation(validRec);
      expect(res.valid).toBe(true);
      expect(res.recommendation?.title).toBe('Valid Title');
    });

    it('rejects unknown transformation types gracefully', () => {
      const rec = { id: 'rec-unknown', title: 'Unknown Action', transformation: 'non-existent-trans' };
      const res = validateRecommendation(rec);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('UNKNOWN_TRANSFORMATION');
      expect(res.message).toContain('CraftLens does not have an automatic fix for it yet');
    });
  });

  describe('Section 6, 7 & 8: Three Fix Modes (Safe, Assisted, Manual) & No Fake Fixes', () => {
    it('supports all 17 transformation definitions in the capability registry', () => {
      const transformations = [
        'distill', 'reshape', 'restructure', 'differentiate', 'hierarchize',
        'group', 'simplify', 'typeset', 'colorize', 'quieter', 'clarify',
        'strengthen-content', 'improve-interaction', 'improve-responsive',
        'harden', 'normalize', 'polish',
      ];

      for (const t of transformations) {
        expect(TRANSFORMATION_CAPABILITIES[t]).toBeDefined();
        expect(TRANSFORMATION_CAPABILITIES[t].transformation).toBe(t);
        expect(['safe', 'assisted', 'manual']).toContain(TRANSFORMATION_CAPABILITIES[t].defaultMode);
      }
    });

    it('never pretends a manual recommendation has an automatic fix (no fake patches)', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const finding: any = {
        ruleId: 'UI-004',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      };

      const manualRec: any = {
        id: 'rec-manual-normalize',
        title: 'Normalize border radius scale',
        description: 'Audit corner radii against 4/8/12/16px scale tokens.',
        transformation: 'normalize',
      };

      const result = await applyCmd(finding, manualRec);
      expect(result.success).toBe(true);
      expect(result.code).toBe('MANUAL_ONLY');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("automatic fix isn't available")
      );
      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('previews assisted fix in native diff without applying prematurely', async () => {
      const previewCmd = registeredCommands.get('craftlens.previewRecommendation')!;
      const finding: any = {
        ruleId: 'CP-007',
        message: 'repeated card layout',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 3, column: 1 }, end: { line: 4, column: 1 } },
      };

      const assistedRec: any = {
        id: 'rec-assisted-hierarchize',
        title: '01 Hierarchize Cards',
        transformation: 'hierarchize',
      };

      const res = await previewCmd(finding, assistedRec);
      expect(res.success).toBe(true);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.anything(),
        expect.anything(),
        expect.stringContaining('01 Hierarchize Cards')
      );
      expect(res.modifiedText).toContain('service-box-featured');
    });

    it('applies assisted fix with workspace edit and saves file on apply', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const finding: any = {
        ruleId: 'CP-007',
        message: 'repeated card layout',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 3, column: 1 }, end: { line: 4, column: 1 } },
      };

      const assistedRec: any = {
        id: 'rec-apply-hierarchize',
        title: '01 Hierarchize Cards',
        transformation: 'hierarchize',
      };

      const res = await applyCmd(finding, assistedRec);
      expect(res.success).toBe(true);
      expect(vscode.workspace.applyEdit).toHaveBeenCalled();
      expect(res.modifiedText).toContain('service-box-featured');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Applied')
      );
    });
  });

  describe('Section 10 & 11 & 12: Stale Findings, File Path & Workspace Edit Safety', () => {
    it('detects stale recommendations when target line exceeds document length', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const finding: any = {
        ruleId: 'UI-006',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 9999, column: 1 }, end: { line: 9999, column: 10 } },
      };

      const rec: any = {
        id: 'rec-stale',
        title: 'Stale Fix',
        transformation: 'hierarchize',
        fix: {
          type: 'safe',
          edits: [
            { filePath: testFile, startLine: 9999, endLine: 9999, newText: 'replacement' },
          ],
        },
      };

      const res = await applyCmd(finding, rec);
      expect(res.success).toBe(false);
      expect(res.code).toBe('STALE_RECOMMENDATION');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('This recommendation is no longer valid because the file changed')
      );
      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('rejects target file paths outside workspace to prevent path traversal', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const outsideFile = path.resolve('/outside/workspace/Malicious.tsx');
      const finding: any = {
        ruleId: 'UI-006',
        filePath: outsideFile,
        location: { filePath: outsideFile, start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
      };

      const rec: any = {
        id: 'rec-traversal',
        title: 'Traversal Fix',
        transformation: 'hierarchize',
      };

      const res = await applyCmd(finding, rec);
      expect(res.success).toBe(false);
      expect(res.code).toBe('PATH_OUTSIDE_WORKSPACE');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Target file path is outside the active workspace')
      );
      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('handles deleted or non-existent target files gracefully', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const nonExistentFile = path.join(tempRoot, 'DeletedFile.tsx');
      const finding: any = {
        ruleId: 'UI-006',
        filePath: nonExistentFile,
        location: { filePath: nonExistentFile, start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
      };

      const rec: any = {
        id: 'rec-missing-file',
        title: 'Fix Deleted',
        transformation: 'hierarchize',
      };

      const res = await applyCmd(finding, rec);
      expect(res.success).toBe(false);
      expect(res.code).toBe('FILE_UNAVAILABLE');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('The target file is no longer available')
      );
      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    });
  });

  describe('Section 15 & 16: Preview/Apply Parity and Re-scan Verification', () => {
    it('ensures Preview and Apply share the exact same underlying validation', async () => {
      const previewCmd = registeredCommands.get('craftlens.previewRecommendation')!;
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;

      const finding: any = {
        ruleId: 'CP-007',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 3, column: 1 }, end: { line: 4, column: 1 } },
      };

      const rec: any = {
        id: 'rec-parity-test',
        title: '01 Hierarchize Cards',
        transformation: 'hierarchize',
      };

      const previewRes = await previewCmd(finding, rec);
      const applyRes = await applyCmd(finding, rec);

      expect(previewRes.modifiedText).toBe(applyRes.modifiedText);
      expect(previewRes.targetUri?.fsPath).toBe(applyRes.targetUri?.fsPath);
    });

    it('hardens applySuggestion with detail-panel payload and checks bounds', async () => {
      const applySuggestionCmd = registeredCommands.get('craftlens.applySuggestion')!;

      await applySuggestionCmd({
        filePath: testFile,
        line: 3,
        replacement: '<div class="service-box-featured">Service 1</div>',
      });

      expect(vscode.workspace.applyEdit).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Applied')
      );
    });
  });

  describe('Section 17: Multi-Category Coverage', () => {
    it('handles accessibility findings and recommendations gracefully', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const finding: any = {
        ruleId: 'AX-016',
        category: 'accessibility',
        message: 'Icon button lacks accessible label',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 3, column: 1 }, end: { line: 3, column: 20 } },
      };

      const rec: any = {
        id: 'rec-ax-1',
        title: 'Add aria-label',
        transformation: 'clarify',
      };

      const res = await applyCmd(finding, rec);
      expect(res.success).toBe(true);
      expect(res.code).toBe('MANUAL_ONLY');
    });

    it('handles performance findings and recommendations gracefully', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const finding: any = {
        ruleId: 'CSS-005',
        category: 'performance',
        message: 'Magic z-index value',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 3, column: 1 }, end: { line: 3, column: 20 } },
      };

      const rec: any = {
        id: 'rec-perf-1',
        title: 'Align to z-index token stack',
        transformation: 'normalize',
      };

      const res = await applyCmd(finding, rec);
      expect(res.success).toBe(true);
      expect(res.code).toBe('MANUAL_ONLY');
    });

    it('handles security findings and recommendations gracefully', async () => {
      const applyCmd = registeredCommands.get('craftlens.applyRecommendation')!;
      const finding: any = {
        ruleId: 'SEC-001',
        category: 'security',
        message: 'Exposed secret detected',
        filePath: testFile,
        location: { filePath: testFile, start: { line: 3, column: 1 }, end: { line: 3, column: 20 } },
      };

      const rec: any = {
        id: 'rec-sec-1',
        title: 'Extract secret to environment variable',
        transformation: 'harden',
      };

      const res = await applyCmd(finding, rec);
      expect(res.success).toBe(true);
      expect(res.code).toBe('MANUAL_ONLY');
    });
  });
});
