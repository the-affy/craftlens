import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSource } from '../../packages/parser/src/index.js';
import { SEC_001_RULE } from '../../packages/rule-engine/src/rules/security/SEC-001-exposed-secret.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule SEC-001: Exposed Secret', () => {
  it('should flag plaintext API keys and tokens (positive case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/positive/SEC-001.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = SEC_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(3);
    expect(findings[0].ruleId).toBe('SEC-001');
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].confidence).toBe(0.95);
  });

  it('should not flag environment variables or placeholder tokens (negative case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/negative/SEC-001.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = SEC_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should flag high-entropy credentials in property assignments (edge case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/edge/SEC-001.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = SEC_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('SEC-001');
  });
});
