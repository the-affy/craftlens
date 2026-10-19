import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSource } from '../../packages/parser/src/index.js';
import { AP_014_RULE } from '../../packages/rule-engine/src/rules/patchwork/AP-014-any-escape-hatch.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule AP-014: Unsafe Any Escape Hatch', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures/AP-014');

  it('should flag explicit any usages in arguments, variables, and assertions (positive case)', () => {
    const filePath = path.join(fixturesDir, 'should-flag.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = AP_014_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings[0].ruleId).toBe('AP-014');
    expect(findings[0].fix?.kind).toBe('safe');
    expect(findings[0].fix?.changes[0].newText).toBe('unknown');
  });

  it('should not flag properly typed TypeScript code using unknown or interfaces (negative case)', () => {
    const filePath = path.join(fixturesDir, 'should-not-flag.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = AP_014_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should flag default any in generic parameters (edge case)', () => {
    const filePath = path.join(fixturesDir, 'edge-case.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = AP_014_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
  });

  it('should not flag legacy interop with intentional comment (false positive mitigation)', () => {
    const filePath = path.join(fixturesDir, 'false-positive.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = AP_014_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should never flag .d.ts declaration files', () => {
    const filePath = '/test/legacy-module.d.ts';
    const content = 'export declare function legacyFn(arg: any): any;';
    const parsed = parseSource(filePath, content);

    const findings = AP_014_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
