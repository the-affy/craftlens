import { describe, it, expect } from 'vitest';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '../../packages/rule-engine/src/index.js';
import { DEFAULT_CONFIG } from '../../packages/config/src/index.js';

describe('Integration: Comment-Based Suppressions', () => {
  const registry = new RuleRegistry();
  registerDefaultRules(registry);
  const engine = new RuleEngine(registry);

  it('suppresses finding using craftlens-disable-next-line', () => {
    const source = `
      export function test() {
        // craftlens-disable-next-line AP-008
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

  it('suppresses finding using craftlens-disable-line', () => {
    const source = `
      export function test() {
        try { doWork(); } catch {} // craftlens-disable-line AP-008
      }
    `;

    const res = engine.analyze({
      filePath: '/virtual/suppress.ts',
      sourceText: source,
      config: DEFAULT_CONFIG,
    });

    expect(res.findings.length).toBe(0);
  });

  it('suppresses entire file using craftlens-disable-file', () => {
    const source = `
      /* craftlens-disable-file */
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

  it('suppresses finding using craftlens-disable-next-line without hyphen and with reason comment', () => {
    const source = `
      export function test() {
        // craftlens-disable-next-line AP-008 -- reason: Intentional empty catch
        try { doWork(); } catch {}
      }
    `;

    const res = engine.analyze({
      filePath: '/virtual/suppress-craftlens.ts',
      sourceText: source,
      config: DEFAULT_CONFIG,
    });

    expect(res.findings.length).toBe(0);
  });

  it('suppresses finding using craftlens-disable single line comment', () => {
    const source = `
      // craftlens-disable AP-008
      export function test() {
        try { doWork(); } catch {}
      }
    `;

    const res = engine.analyze({
      filePath: '/virtual/suppress-range.ts',
      sourceText: source,
      config: DEFAULT_CONFIG,
    });

    expect(res.findings.length).toBe(0);
  });
});
