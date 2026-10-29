import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  UniversalFixValidator,
  validateSyntax,
  validateStructuralIntegrity,
  validateSemanticDiagnostics,
  ContextAwareFixGenerator,
  IssueRegistry,
  ChangeManager,
  findingToIssue,
  Finding,
} from '@craftlens/core';

describe('Universal Safe Code Fix & Regression Validation (Section 34)', () => {
  let tempDir: string;
  let registry: IssueRegistry;
  let changeManager: ChangeManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftlens-universal-fix-test-'));
    registry = new IssueRegistry(tempDir);
    changeManager = new ChangeManager(registry, tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('1. Section 34: CSS Gradient Bug & Token Protection', () => {
    it('generates valid token reference and NEVER produces malformed property in gradient', () => {
      const gradientCss = 'background: linear-gradient(90deg, #38bdf8 0%, #0ea5e9 100%);';
      const finding: Finding = {
        ruleId: 'UI-001',
        title: 'Hardcoded Hex in Gradient',
        message: 'Hardcoded color #38bdf8 inside linear-gradient',
        severity: 'warning',
        location: {
          filePath: 'src/styles.css',
          start: { line: 10, column: 36, offset: 120 },
          end: { line: 10, column: 43, offset: 127 },
        },
      };

      const suggestions = ContextAwareFixGenerator.generateSuggestions(finding, gradientCss);
      expect(suggestions.length).toBeGreaterThan(0);

      const autoFix = suggestions.find(s => s.type === 'autofix');
      expect(autoFix).toBeDefined();

      // Must be a valid in-place token reference
      expect(autoFix!.replacement).toBe('var(--color-accent)');

      // Critical Requirement: Output must NEVER contain the corrupted declaration
      const corruptedPattern = '--color-accent: #38bdf8; 0%, #0ea5e9 100%);';
      expect(autoFix!.replacement).not.toContain(corruptedPattern);
      expect(autoFix!.replacement).not.toContain(';');

      // Simulated replacement produces 100% valid CSS
      const fixedCss = gradientCss.replace('#38bdf8', autoFix!.replacement!);
      expect(fixedCss).toBe('background: linear-gradient(90deg, var(--color-accent) 0%, #0ea5e9 100%);');
      expect(fixedCss).not.toContain(corruptedPattern);

      const syntaxResult = validateSyntax('src/styles.css', `button { ${fixedCss} }`);
      expect(syntaxResult.valid).toBe(true);
      expect(syntaxResult.errors.length).toBe(0);
    });

    it('explicitly catches and rejects malformed CSS gradient replacements', () => {
      // The exact regression pattern that must be stopped:
      const malformedCss = 'button { background: linear-gradient(90deg, --color-accent: #38bdf8; 0%, #0ea5e9 100%); }';

      const syntaxCheck = validateSyntax('src/styles.css', malformedCss);
      expect(syntaxCheck.valid).toBe(false);
      expect(syntaxCheck.errors.some(e => e.includes('corrupted property replacement') || e.includes('Dangling argument') || e.includes('linear-gradient'))).toBe(true);

      const structuralCheck = validateStructuralIntegrity(
        'src/styles.css',
        'button { background: linear-gradient(90deg, #38bdf8 0%, #0ea5e9 100%); }',
        malformedCss,
        tempDir
      );
      expect(structuralCheck.valid).toBe(false);
      expect(structuralCheck.errors.some(e => e.includes('Semicolon cannot exist within linear-gradient'))).toBe(true);
    });
  });

  describe('2. Universal Syntax & Structural Safety Across Languages', () => {
    it('detects malformed TypeScript / JavaScript syntax', () => {
      // Malformed function signature
      const badFunc = 'function getUser(id: string {\n  return user;\n}';
      const r1 = validateSyntax('src/user.ts', badFunc);
      expect(r1.valid).toBe(false);
      expect(r1.errors.length).toBeGreaterThan(0);

      // Unclosed expression / statement
      const unclosedCall = 'const result = await fetch(';
      const r2 = validateSyntax('src/api.js', unclosedCall);
      expect(r2.valid).toBe(false);
      expect(r2.errors.length).toBeGreaterThan(0);

      // Valid TS passes cleanly
      const goodTs = 'export function getUser(id: string): string {\n  return id;\n}\n';
      const r3 = validateSyntax('src/user.ts', goodTs);
      expect(r3.valid).toBe(true);
      expect(r3.errors.length).toBe(0);
    });

    it('detects malformed TSX / JSX tags and unclosed elements', () => {
      const badTsx = 'export const Card = () => (\n  <Component\n    title="Hello"\n);\n';
      const r1 = validateSyntax('src/Card.tsx', badTsx);
      expect(r1.valid).toBe(false);

      const goodTsx = 'export const Card = () => (\n  <Component\n    title="Hello"\n  />\n);\n';
      const r2 = validateSyntax('src/Card.tsx', goodTsx);
      expect(r2.valid).toBe(true);
    });

    it('detects malformed CSS / SCSS / LESS braces and parentheses', () => {
      // Unbalanced closing brace
      const badCss1 = '.btn { color: red; } }';
      expect(validateSyntax('src/btn.css', badCss1).valid).toBe(false);

      // Unclosed parenthesis
      const badCss2 = '.btn { background: rgba(0, 0, 0, 0.5; }';
      expect(validateSyntax('src/btn.scss', badCss2).valid).toBe(false);

      // Valid CSS passes
      const goodCss = '.btn { color: var(--color-accent); margin: 0 4px; }';
      expect(validateSyntax('src/btn.css', goodCss).valid).toBe(true);
    });

    it('detects malformed JSON and enforces strict validity', () => {
      // Trailing comma
      const badJson1 = '{\n  "name": "CraftLens",\n}';
      const r1 = validateSyntax('package.json', badJson1);
      expect(r1.valid).toBe(false);
      expect(r1.errors[0]).toContain('JSON syntax error');

      // Unquoted property key
      const badJson2 = '{\n  name: "CraftLens"\n}';
      const r2 = validateSyntax('config.json', badJson2);
      expect(r2.valid).toBe(false);

      // Valid JSON
      const goodJson = '{\n  "name": "CraftLens",\n  "version": "4.1.0"\n}';
      expect(validateSyntax('package.json', goodJson).valid).toBe(true);
    });

    it('detects malformed HTML tags, nesting, and duplicate IDs', () => {
      // Unclosed div tag
      const badHtml1 = '<main>\n  <div>Content\n</main>';
      expect(validateSyntax('index.html', badHtml1).valid).toBe(false);

      // Duplicate element ID
      const badHtml2 = '<div><span id="header">A</span><span id="header">B</span></div>';
      const r2 = validateSyntax('index.html', badHtml2);
      expect(r2.valid).toBe(false);
      expect(r2.errors.some(e => e.includes('Duplicate element ID "header"'))).toBe(true);

      // Valid HTML passes
      const goodHtml = '<!DOCTYPE html>\n<html>\n<body>\n  <div id="app">Hello</div>\n</body>\n</html>';
      expect(validateSyntax('index.html', goodHtml).valid).toBe(true);
    });
  });

  describe('3. Transactional Rollback on Post-Apply Validation Failure', () => {
    it('atomically rolls back changes, marks change failed, and keeps issue open if validation fails', async () => {
      const srcFile = path.join(tempDir, 'src/math.ts');
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      const originalCode = 'export function calculateTotal(a: number, b: number): number {\n  return a + b;\n}\n';
      fs.writeFileSync(srcFile, originalCode, 'utf-8');

      const rawFinding: Finding = {
        ruleId: 'AP-008',
        title: 'Function math check',
        message: 'Potential precision issue',
        severity: 'warning',
        location: {
          filePath: srcFile,
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 2, offset: originalCode.length },
        },
      };
      const issue = findingToIssue(rawFinding);
      registry.registerIssue(issue);

      // Manually register a change that introduces a broken function signature
      const brokenNewContent = 'export function calculateTotal(a: number, b: number: number {\n  return a + b;\n}\n';
      const changeId = 'chg_broken_syntax';
      changeManager.registerChange({
        id: changeId,
        issueIds: [issue.id],
        title: 'Fix math precision',
        explanation: 'Update math calculation',
        status: 'approved',
        files: [
          {
            filePath: srcFile,
            originalContent: originalCode,
            newContent: brokenNewContent,
            additions: 1,
            deletions: 1,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Attempt to apply change
      const applyResult = await changeManager.applyChange(changeId);

      // Must fail
      expect(applyResult.success).toBe(false);
      expect(applyResult.error?.toLowerCase()).toContain('validation failed');

      // Requirement: Disk content must be atomically rolled back to original
      const diskContent = fs.readFileSync(srcFile, 'utf-8');
      expect(diskContent).toBe(originalCode);
      expect(diskContent).not.toContain('b: number: number');

      // Requirement: Change status marked 'failed'
      const updatedChange = changeManager.getChange(changeId);
      expect(updatedChange?.status).toBe('failed');

      // Requirement: Linked issue remains 'open'
      const updatedIssue = registry.getIssue(issue.id);
      expect(updatedIssue?.status).toBe('open');
      expect(updatedIssue?.verification?.status).toBe('failed');
    });

    it('successfully applies valid changes and sets status to applied', async () => {
      const srcFile = path.join(tempDir, 'src/math.ts');
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      const originalCode = 'export function calculateTotal(a: number, b: number): number {\n  return a + b;\n}\n';
      fs.writeFileSync(srcFile, originalCode, 'utf-8');

      const rawFinding: Finding = {
        ruleId: 'AP-008',
        title: 'Function math check',
        message: 'Potential precision issue',
        severity: 'warning',
        location: {
          filePath: srcFile,
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 2, offset: originalCode.length },
        },
      };
      const issue = findingToIssue(rawFinding);
      registry.registerIssue(issue);

      const validNewContent = 'export function calculateTotal(a: number, b: number): number {\n  return Math.round((a + b) * 100) / 100;\n}\n';
      const changeId = 'chg_valid_syntax';
      changeManager.registerChange({
        id: changeId,
        issueIds: [issue.id],
        title: 'Fix math precision cleanly',
        explanation: 'Round to 2 decimal places',
        status: 'approved',
        files: [
          {
            filePath: srcFile,
            originalContent: originalCode,
            newContent: validNewContent,
            additions: 1,
            deletions: 1,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const applyResult = await changeManager.applyChange(changeId);
      expect(applyResult.success).toBe(true);

      const diskContent = fs.readFileSync(srcFile, 'utf-8');
      expect(diskContent).toBe(validNewContent);

      const updatedChange = changeManager.getChange(changeId);
      expect(updatedChange?.status).toBe('applied');

      const updatedIssue = registry.getIssue(issue.id);
      expect(updatedIssue?.status).toBe('applied');
    });
  });

  describe('4. Differential Diagnostics (Pre-existing vs Introduced Errors)', () => {
    it('does not reject patch for pre-existing errors in unchanged files when no new errors are introduced', () => {
      const preExistingInvalid = 'const a = ;'; // pre-existing broken code
      const fileBefore = preExistingInvalid;
      const fileAfter = preExistingInvalid; // no change

      const beforeSyntax = validateSyntax('src/legacy.ts', fileBefore);
      const afterSyntax = validateSyntax('src/legacy.ts', fileAfter);

      // Both are invalid, but the patch did NOT introduce a regression
      expect(beforeSyntax.valid).toBe(false);
      expect(afterSyntax.valid).toBe(false);

      // Regression condition: (before.valid && !after.valid) is FALSE
      const isSyntaxRegression = beforeSyntax.valid && !afterSyntax.valid;
      expect(isSyntaxRegression).toBe(false);
    });

    it('rejects patch when file was previously valid and becomes invalid', () => {
      const fileBefore = 'export const greeting = "hello";\n';
      const fileAfter = 'export const greeting = ;\n';

      const beforeSyntax = validateSyntax('src/greeting.ts', fileBefore);
      const afterSyntax = validateSyntax('src/greeting.ts', fileAfter);

      expect(beforeSyntax.valid).toBe(true);
      expect(afterSyntax.valid).toBe(false);

      const isSyntaxRegression = beforeSyntax.valid && !afterSyntax.valid;
      expect(isSyntaxRegression).toBe(true);
    });
  });

  describe('5. Real Diff Preview Identity & Safety Validation', () => {
    it('validates patch freshness and catches external disk changes', () => {
      const srcFile = path.join(tempDir, 'src/Component.tsx');
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      fs.writeFileSync(srcFile, 'export const Comp = () => <div>A</div>;\n', 'utf-8');

      const staleChange = {
        id: 'stale_chg',
        issueIds: ['iss_stale'],
        title: 'Stale patch check',
        explanation: 'Check disk changes',
        status: 'proposed' as const,
        files: [
          {
            filePath: srcFile,
            originalContent: 'export const Comp = () => <div>OLD</div>;\n',
            newContent: 'export const Comp = () => <div>NEW</div>;\n',
            additions: 1,
            deletions: 1,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = UniversalFixValidator.validatePatch(staleChange, tempDir);
      expect(result.valid).toBe(false);
      expect(result.failures.some(f => f.stage === 'stale_check')).toBe(true);
      expect(result.failures[0].message).toContain('The file changed after this fix was generated');
    });

    it('blocks path traversal outside workspace', () => {
      const maliciousChange = {
        id: 'traversal_chg',
        issueIds: ['iss_malicious'],
        title: 'Path traversal attempt',
        explanation: 'Testing security boundary',
        status: 'proposed' as const,
        files: [
          {
            filePath: '../../etc/passwd',
            originalContent: '',
            newContent: 'root:x:0:0::/root:/bin/bash',
            additions: 1,
            deletions: 0,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = UniversalFixValidator.validatePatch(maliciousChange, tempDir);
      expect(result.valid).toBe(false);
      expect(result.failures.some(f => f.stage === 'scope' && f.message.includes('Path traversal'))).toBe(true);
    });
  });
});
