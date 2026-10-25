import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSource } from '../../packages/parser/src/index.js';
import { RE_001_RULE } from '../../packages/rule-engine/src/rules/react/RE-001-effect-for-derived-value.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule RE-001: Effect for Derived Value', () => {
  it('should flag useEffect used only to update state from props (positive case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/positive/RE-001.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = RE_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RE-001');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].confidence).toBe(0.90);
    expect(findings[0].recommendation).toContain('Compute the value directly during render');
  });

  it('should not flag effect containing external side-effects like network calls (negative case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/negative/RE-001.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = RE_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should flag concise arrow function useEffect setting derived state (edge case)', () => {
    const filePath = path.resolve(__dirname, '../fixtures/edge/RE-001.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSource(filePath, content);

    const findings = RE_001_RULE.detect({
      filePath,
      sourceCode: content,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RE-001');
  });
});
