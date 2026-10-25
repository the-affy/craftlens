import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSource } from '../../packages/parser/src/index.js';
import { CD_001_RULE } from '../../packages/rule-engine/src/rules/code/CD-001-chained-type-assertions.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CD-001: Chained Type Assertions', () => {
  it('should flag chained type assertions (positive case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/positive/CD-001.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = CD_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(2);
    expect(findings[0].ruleId).toBe('CD-001');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].confidence).toBe(0.92);
  });

  it('should not flag valid single assertions and type guards (negative case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/negative/CD-001.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = CD_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should flag deeply parenthesized chained assertions (edge case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/edge/CD-001.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = CD_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CD-001');
  });
});
