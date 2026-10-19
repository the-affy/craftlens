import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSource } from '../../packages/parser/src/index.js';
import { FN_015_RULE } from '../../packages/rule-engine/src/rules/functionality/FN-015-clickable-non-interactive.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule FN-015: Clickable Non-Interactive Element', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures/FN-015');

  it('should flag div and span elements with onClick and no keyboard/role (positive case)', () => {
    const filePath = path.join(fixturesDir, 'should-flag.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = FN_015_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(2);
    expect(findings[0].ruleId).toBe('FN-015');
    expect(findings[0].fix).toBeDefined();
    expect(findings[0].fix?.changes[0].newText).toContain('role="button"');
  });

  it('should not flag native buttons or divs with role and keyboard handlers (negative case)', () => {
    const filePath = path.join(fixturesDir, 'should-not-flag.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = FN_015_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should not flag elements with aria-hidden="true" (edge case)', () => {
    const filePath = path.join(fixturesDir, 'edge-case.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = FN_015_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should not flag custom design system components with onClick (false positive mitigation)', () => {
    const filePath = path.join(fixturesDir, 'false-positive.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = FN_015_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
