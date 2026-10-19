import { describe, it, expect } from 'vitest';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '../../packages/rule-engine/src/index.js';
import { DEFAULT_CONFIG } from '../../packages/config/src/index.js';

describe('Integration: Comment-Based Suppressions', () => {
  const registry = new RuleRegistry();
  registerDefaultRules(registry);
  const engine = new RuleEngine(registry);

  it('suppresses finding using anti-slop-disable-next-line', () => {
    const source = `
      export function test() {
        // anti-slop-disable-next-line AP-008
        try { doWork(); } catch {}
      }
    `;

    const res = engine.analyze({
      filePath: '/virtual/suppress.ts',
      sourceText: source,
      config: DEFAULT_CONFIG,
    });

    expect(res.findings.length).toBe(0);
  });

  it('suppresses finding using anti-slop-disable-line', () => {
    const source = `
      export function test() {
        try { doWork(); } catch {} // anti-slop-disable-line AP-008
      }
    `;

    const res = engine.analyze({
      filePath: '/virtual/suppress.ts',
      sourceText: source,
      config: DEFAULT_CONFIG,
    });

    expect(res.findings.length).toBe(0);
  });

  it('suppresses entire file using anti-slop-disable-file', () => {
    const source = `
      /* anti-slop-disable-file */
      export function test(a: any) {
        try { doWork(a); } catch {}
      }
    `;

    const res = engine.analyze({
      filePath: '/virtual/suppress-file.ts',
      sourceText: source,
      config: DEFAULT_CONFIG,
    });

    expect(res.findings.length).toBe(0);
  });
});
