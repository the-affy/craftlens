import { describe, it, expect } from 'vitest';
import { RuleRegistry, RuleEngine, registerDefaultRules, AS_001_CLUSTER } from '../../packages/rule-engine/src/index.js';
import { DEFAULT_CONFIG } from '../../packages/config/src/index.js';
import { Finding, createLocation } from '../../packages/core/src/index.js';

describe('Integration: RuleEngine & Core Infrastructure', () => {
  it('executes end-to-end analysis across registered rules and caches AST', () => {
    const registry = new RuleRegistry();
    registerDefaultRules(registry);
    expect(registry.size()).toBe(6);

    const engine = new RuleEngine(registry);

    const source = `
      export function badCode(data: any) {
        try {
          doWork(data);
        } catch {
        }
      }
    `;

    // First run (cache miss)
    const res1 = engine.analyze({
      filePath: '/virtual/test.ts',
      sourceText: source,
      version: 1,
      config: DEFAULT_CONFIG,
    });

    expect(res1.fromCache).toBe(false);
    expect(res1.findings.length).toBe(2); // AP-014 (any) and AP-008 (empty catch)
    expect(res1.totalTimeMs).toBeGreaterThan(0);

    // Second run with identical content (cache hit)
    const res2 = engine.analyze({
      filePath: '/virtual/test.ts',
      sourceText: source,
      version: 1,
      config: DEFAULT_CONFIG,
    });

    expect(res2.fromCache).toBe(true);
    expect(res2.findings.length).toBe(2);

    // Verify performance tracker recorded the metrics
    const stats = engine.getPerformanceTracker().getStats();
    expect(stats.totalRuns).toBe(2);
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
  });

  it('respects severity threshold filtering', () => {
    const registry = new RuleRegistry();
    registerDefaultRules(registry);
    const engine = new RuleEngine(registry);

    const source = `
      try { doWork(); } catch {}
    `;

    // When threshold is 'blocker', 'warning' findings should be excluded
    const res = engine.analyze({
      filePath: '/virtual/test.ts',
      sourceText: source,
      config: {
        ...DEFAULT_CONFIG,
        severity: 'blocker',
      },
    });

    expect(res.findings.length).toBe(0);
  });

  it('evaluates RuleCluster proof-of-concept when threshold is met', () => {
    const dummyLoc = createLocation('/test.tsx', 1, 1, 0, 1, 10, 10);
    const signals: Finding[] = [
      {
        ruleId: 'UI-001-centered-hero',
        message: 'Centered hero',
        description: 'Centered hero',
        severity: 'suggestion',
        confidence: 0.8,
        location: dummyLoc,
        evidence: [],
      },
      {
        ruleId: 'UI-002-dual-cta',
        message: 'Dual CTA',
        description: 'Dual CTA',
        severity: 'suggestion',
        confidence: 0.75,
        location: dummyLoc,
        evidence: [],
      },
      {
        ruleId: 'UI-003-generic-feature-cards',
        message: 'Generic feature cards',
        description: 'Generic feature cards',
        severity: 'suggestion',
        confidence: 0.9,
        location: dummyLoc,
        evidence: [],
      },
    ];

    const clusterFinding = AS_001_CLUSTER.createFinding(signals);
    expect(clusterFinding).not.toBeNull();
    expect(clusterFinding?.ruleId).toBe('AS-001');
    expect(clusterFinding?.confidence).toBeGreaterThan(0.9);
  });
});
