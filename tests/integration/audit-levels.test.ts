import { describe, it, expect } from 'vitest';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '../../packages/rule-engine/src/index.js';
import { DEFAULT_CONFIG } from '../../packages/config/src/index.js';

describe('Audit Levels Matrix: Easy, Moderate, Hard, Strict', () => {
  const registry = new RuleRegistry();
  registerDefaultRules(registry);
  const engine = new RuleEngine(registry);

  // Source containing:
  // 1. AP-008 (Silent exception - minimum: 'easy')
  // 2. AP-014 (Any escape hatch - minimum: 'moderate')
  // 3. CSS-005 (Magic z-index - minimum: 'moderate')
  const testSource = `
    export function process(data: any) {
      try {
        doSomething(data);
      } catch {}
      return <div className="z-[99999]">Content</div>;
    }
  `;

  it('runs only high-confidence issues on Easy level', () => {
    const result = engine.analyze({
      filePath: '/virtual/test.tsx',
      sourceText: testSource,
      config: {
        ...DEFAULT_CONFIG,
        auditLevel: 'easy',
      },
    });

    const ruleIds = result.findings.map(f => f.ruleId);
    // AP-008 has minimumAuditLevel 'easy', should be present
    expect(ruleIds).toContain('AP-008');

    // AP-014 and CSS-005 have minimumAuditLevel 'moderate', should NOT be present on Easy
    expect(ruleIds).not.toContain('AP-014');
    expect(ruleIds).not.toContain('CSS-005');
  });

  it('runs both easy and moderate rules on Moderate level', () => {
    const result = engine.analyze({
      filePath: '/virtual/test.tsx',
      sourceText: testSource,
      config: {
        ...DEFAULT_CONFIG,
        auditLevel: 'moderate',
      },
    });

    const ruleIds = result.findings.map(f => f.ruleId);
    expect(ruleIds).toContain('AP-008');
    expect(ruleIds).toContain('AP-014');
    expect(ruleIds).toContain('CSS-005');
  });

  it('runs all applicable rules on Strict level', () => {
    const result = engine.analyze({
      filePath: '/virtual/test.tsx',
      sourceText: testSource,
      config: {
        ...DEFAULT_CONFIG,
        auditLevel: 'strict',
      },
    });

    const ruleIds = result.findings.map(f => f.ruleId);
    expect(ruleIds).toContain('AP-008');
    expect(ruleIds).toContain('AP-014');
    expect(ruleIds).toContain('CSS-005');
  });
});
