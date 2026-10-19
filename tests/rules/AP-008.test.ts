import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSource } from '../../packages/parser/src/index.js';
import { AP_008_RULE } from '../../packages/rule-engine/src/rules/patchwork/AP-008-exception-swallowing.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule AP-008: Silent Exception Swallowing', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures/AP-008');

  it('should flag empty catch blocks and no-op catch blocks (positive case)', () => {
    const filePath = path.join(fixturesDir, 'should-flag.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = AP_008_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(2);
    expect(findings[0].ruleId).toBe('AP-008');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(findings[0].evidence.length).toBeGreaterThan(0);
    expect(findings[0].fix).toBeDefined();
    expect(findings[0].fix?.kind).toBe('safe');
  });

  it('should not flag catch blocks with proper logging or rethrow (negative case)', () => {
    const filePath = path.join(fixturesDir, 'should-not-flag.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = AP_008_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should flag catch blocks without error binding (edge case)', () => {
    const filePath = path.join(fixturesDir, 'edge-case.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = AP_008_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(2);
  });

  it('should not flag catch blocks containing intentional ignore comments (false positive mitigation)', () => {
    const filePath = path.join(fixturesDir, 'false-positive.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = AP_008_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
