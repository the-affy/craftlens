import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '@craftlens/rule-engine';

describe('UI/UX Benchmark Suite (Requirement 24 & 26)', () => {
  const registry = new RuleRegistry();
  registerDefaultRules(registry);
  const engine = new RuleEngine(registry);

  const benchmarkRoot = path.resolve(__dirname, '../../craftlens-ui-benchmark');

  function analyzeBenchmark(subDir: string) {
    const file = path.join(benchmarkRoot, subDir, 'index.html');
    const source = fs.readFileSync(file, 'utf-8');
    return engine.analyze({ filePath: file, sourceText: source });
  }

  describe('Deliberately Bad Examples (Must flag specific problems)', () => {
    it('01-card-soup triggers Card Soup (CP-007)', () => {
      const res = analyzeBenchmark('01-card-soup');
      expect(res.findings.some(f => f.ruleId === 'CP-007')).toBe(true);
    });

    it('02-generic-dashboard triggers generic dashboard fingerprint (UI-015)', () => {
      const res = analyzeBenchmark('02-generic-dashboard');
      expect(res.findings.some(f => f.ruleId === 'UI-015')).toBe(true);
    });

    it('03-saas-template triggers SaaS template fingerprint (UI-015)', () => {
      const res = analyzeBenchmark('03-saas-template');
      expect(res.findings.some(f => f.ruleId === 'UI-015')).toBe(true);
    });

    it('04-gradient-glow triggers glow/gradient rules (UI-002 / UI-013)', () => {
      const res = analyzeBenchmark('04-gradient-glow');
      expect(res.findings.some(f => f.ruleId === 'UI-002' || f.ruleId === 'UI-013')).toBe(true);
    });

    it('05-ai-purple-ui triggers AI signature stack (UI-016)', () => {
      const res = analyzeBenchmark('05-ai-purple-ui');
      expect(res.findings.some(f => f.ruleId === 'UI-016' || f.ruleId === 'UI-001')).toBe(true);
    });

    it('06-badge-everything triggers badge saturation (UI-009 / UI-017)', () => {
      const res = analyzeBenchmark('06-badge-everything');
      expect(res.findings.some(f => f.ruleId === 'UI-009' || f.ruleId === 'UI-017')).toBe(true);
    });

    it('07-generic-cta triggers generic CTA language (CP-002)', () => {
      const res = analyzeBenchmark('07-generic-cta');
      expect(res.findings.some(f => f.ruleId === 'CP-002')).toBe(true);
    });

    it('09-weak-hierarchy triggers weak visual hierarchy (VH-008)', () => {
      const res = analyzeBenchmark('09-weak-hierarchy');
      expect(res.findings.some(f => f.ruleId === 'VH-008')).toBe(true);
    });

    it('11-fake-product triggers fake product signals (UI-019)', () => {
      const res = analyzeBenchmark('11-fake-product');
      expect(res.findings.some(f => f.ruleId === 'UI-019')).toBe(true);
    });

    it('12-trend-stacking triggers trend stacking (UI-013 / UI-014)', () => {
      const res = analyzeBenchmark('12-trend-stacking');
      expect(res.findings.some(f => f.ruleId === 'UI-013' || f.ruleId === 'UI-014')).toBe(true);
    });
  });

  describe('Legitimate Good Examples (Must NOT produce false positives)', () => {
    it('good-dark-mode has 0 UI slop findings', () => {
      const res = analyzeBenchmark('good-dark-mode');
      const slopFindings = res.findings.filter(f => f.ruleId.startsWith('UI-') || f.ruleId.startsWith('CP-'));
      expect(slopFindings.length).toBe(0);
    });

    it('good-bento has 0 UI slop findings', () => {
      const res = analyzeBenchmark('good-bento');
      const slopFindings = res.findings.filter(f => f.ruleId.startsWith('UI-') || f.ruleId.startsWith('CP-'));
      expect(slopFindings.length).toBe(0);
    });

    it('good-gradient-brand has 0 UI slop findings', () => {
      const res = analyzeBenchmark('good-gradient-brand');
      const slopFindings = res.findings.filter(f => f.ruleId.startsWith('UI-') || f.ruleId.startsWith('CP-'));
      expect(slopFindings.length).toBe(0);
    });

    it('good-dense-dashboard has 0 UI slop findings', () => {
      const res = analyzeBenchmark('good-dense-dashboard');
      const slopFindings = res.findings.filter(f => f.ruleId.startsWith('UI-') || f.ruleId.startsWith('CP-'));
      expect(slopFindings.length).toBe(0);
    });

    it('good-rounded-ui has 0 UI slop findings', () => {
      const res = analyzeBenchmark('good-rounded-ui');
      const slopFindings = res.findings.filter(f => f.ruleId.startsWith('UI-') || f.ruleId.startsWith('CP-'));
      expect(slopFindings.length).toBe(0);
    });

    it('good-animation has 0 UI slop findings', () => {
      const res = analyzeBenchmark('good-animation');
      const slopFindings = res.findings.filter(f => f.ruleId.startsWith('UI-') || f.ruleId.startsWith('CP-'));
      expect(slopFindings.length).toBe(0);
    });

    it('good-purple-brand has 0 UI slop findings', () => {
      const res = analyzeBenchmark('good-purple-brand');
      const slopFindings = res.findings.filter(f => f.ruleId.startsWith('UI-') || f.ruleId.startsWith('CP-'));
      expect(slopFindings.length).toBe(0);
    });
  });
});
