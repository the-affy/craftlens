import { describe, it, expect } from 'vitest';
import {
  SkillRegistry,
  SkillManager,
  SkillPackage,
  computeSkillContentHash,
} from '@craftlens/core';
import { RuleRegistry, registerDefaultRules } from '@craftlens/rule-engine';

describe('SkillRegistry, Version Immutability & SkillManager', () => {
  describe('1. Built-in Skills Architecture', () => {
    it('initializes all 9 independently versioned built-in skills', () => {
      const ruleRegistry = new RuleRegistry();
      registerDefaultRules(ruleRegistry);

      const skillManager = new SkillManager();
      skillManager.initBuiltinSkills(ruleRegistry.getAllRules());

      const skills = skillManager.getRegistry().getAllSkills();
      expect(skills.length).toBe(10);

      const skillNames = skills.map(s => s.manifest.name);
      expect(skillNames).toContain('craftlens-core');
      expect(skillNames).toContain('craftlens-product-ui');
      expect(skillNames).toContain('anti-ai-ui');
      expect(skillNames).toContain('ui-ux-pro-max');
      expect(skillNames).toContain('component-reference');
      expect(skillNames).toContain('accessibility');
      expect(skillNames).toContain('security');
      expect(skillNames).toContain('frontend-engineering');
      expect(skillNames).toContain('performance');
      expect(skillNames).toContain('qa-release-assurance');

      // Verify each skill has content hash and version 1.0.0
      for (const skill of skills) {
        expect(skill.version.version).toBe('1.0.0');
        expect(skill.version.contentHash).toBeDefined();
        expect(skill.manifest.license).toBe('MIT');
        expect(skill.trustStatus).toBe('builtin');
      }
    });
  });

  describe('2. Version Immutability & Content Hash Enforcement (Sections 10 & 11)', () => {
    it('rejects silent mutation when same version is re-registered with different content hash', () => {
      const registry = new SkillRegistry();

      const initialPkg: SkillPackage = {
        manifest: {
          name: 'company-rules',
          displayName: 'Company Rules',
          version: '1.4.0',
          description: 'Initial rules',
          author: 'Acme',
          license: 'Proprietary',
          source: { type: 'file', path: '/test.md' },
        },
        rules: [
          {
            id: 'company.button',
            version: '1.4.0',
            description: 'Button rule',
            category: 'ui',
            severity: 'error',
            sourceSkillId: 'company-rules',
            sourceSkillVersion: '1.4.0',
            detect: () => [],
          },
        ],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'file', path: '/test.md' },
        version: {
          skillId: 'company-rules',
          version: '1.4.0',
          contentHash: 'hash_abc123',
          installedAt: '2026-10-21T00:00:00Z',
          source: { type: 'file', path: '/test.md' },
          ruleCount: 1,
        },
      };

      const result1 = registry.register(initialPkg);
      expect(result1.success).toBe(true);

      // Mutated package with SAME version 1.4.0 but DIFFERENT content hash
      const mutatedPkg: SkillPackage = {
        ...initialPkg,
        version: {
          ...initialPkg.version,
          contentHash: 'hash_diff999',
        },
      };

      const result2 = registry.register(mutatedPkg);
      expect(result2.success).toBe(false);
      expect(result2.warnings.length).toBeGreaterThan(0);
      expect(result2.warnings[0]).toContain('Skill version mismatch');
      expect(result2.warnings[0]).toContain('hash_abc123');
    });

    it('preserves version history when upgrading to a new version (Section 9)', () => {
      const registry = new SkillRegistry();

      const v1Pkg: SkillPackage = {
        manifest: {
          name: 'company-rules',
          displayName: 'Company Rules',
          version: '1.0.0',
          description: 'v1 rules',
          author: 'Acme',
          license: 'Proprietary',
          source: { type: 'file', path: '/test.md' },
        },
        rules: [],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'file', path: '/test.md' },
        version: {
          skillId: 'company-rules',
          version: '1.0.0',
          contentHash: 'hash_v1',
          installedAt: '2026-10-20T00:00:00Z',
          source: { type: 'file', path: '/test.md' },
          ruleCount: 0,
        },
      };

      registry.register(v1Pkg);

      const v2Pkg: SkillPackage = {
        ...v1Pkg,
        manifest: { ...v1Pkg.manifest, version: '1.1.0' },
        version: {
          skillId: 'company-rules',
          version: '1.1.0',
          contentHash: 'hash_v2',
          installedAt: '2026-10-21T00:00:00Z',
          source: { type: 'file', path: '/test.md' },
          ruleCount: 1,
        },
      };

      const result = registry.register(v2Pkg);
      expect(result.success).toBe(true);

      const history = registry.getSkillHistory('company-rules');
      expect(history.length).toBe(1);
      expect(history[0].version).toBe('1.0.0');

      const installed = registry.getSkill('company-rules');
      expect(installed?.version.version).toBe('1.1.0');
      expect(installed?.history?.length).toBe(2);
    });
  });

  describe('3. Skill Updates & Changelog Diffing (Sections 21 & 22)', () => {
    it('compares versions and identifies added, changed, and removed rules', () => {
      const registry = new SkillRegistry();

      const v1Pkg: SkillPackage = {
        manifest: {
          name: 'anti-ai-ui',
          displayName: 'Anti-AI UI',
          version: '1.4.0',
          description: 'Anti-AI rules',
          author: 'Vanszs',
          license: 'MIT',
          source: { type: 'github', url: 'https://github.com/Vanszs/Anti-AI-UI' },
        },
        rules: [
          {
            id: 'anti-ai.hero',
            name: 'Generic hero anatomy',
            version: '1.4.0',
            description: 'Legacy hero rule',
            category: 'ui',
            severity: 'warning',
            detect: () => [],
          },
          {
            id: 'anti-ai.card',
            name: 'Card hierarchy detection',
            version: '1.4.0',
            description: 'Card check v1',
            category: 'ui',
            severity: 'warning',
            detect: () => [],
          },
        ],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'github', url: 'https://github.com/Vanszs/Anti-AI-UI' },
        version: {
          skillId: 'anti-ai-ui',
          version: '1.4.0',
          contentHash: 'h1',
          installedAt: '2026-10-20T00:00:00Z',
          source: { type: 'github', url: 'https://github.com/Vanszs/Anti-AI-UI' },
          ruleCount: 2,
        },
      };

      const v2Pkg: SkillPackage = {
        ...v1Pkg,
        manifest: { ...v1Pkg.manifest, version: '1.5.0' },
        rules: [
          // anti-ai.hero was REMOVED
          // anti-ai.card was CHANGED (description changed)
          {
            id: 'anti-ai.card',
            name: 'Card hierarchy detection',
            version: '1.5.0',
            description: 'Updated card check v2 with lower false positives',
            category: 'ui',
            severity: 'suggestion',
            detect: () => [],
          },
          // anti-ai.dashboard was ADDED
          {
            id: 'anti-ai.dashboard',
            name: 'Generic dashboard anatomy',
            version: '1.5.0',
            description: 'Detects template dashboards',
            category: 'ui',
            severity: 'warning',
            detect: () => [],
          },
        ],
        version: {
          skillId: 'anti-ai-ui',
          version: '1.5.0',
          contentHash: 'h2',
          installedAt: '2026-10-21T00:00:00Z',
          source: { type: 'github', url: 'https://github.com/Vanszs/Anti-AI-UI' },
          ruleCount: 2,
        },
      };

      const diff = registry.compareVersions(v1Pkg, v2Pkg);
      expect(diff.fromVersion).toBe('1.4.0');
      expect(diff.toVersion).toBe('1.5.0');
      expect(diff.addedRules).toContain('Generic dashboard anatomy');
      expect(diff.removedRules).toContain('Generic hero anatomy');
      expect(diff.changedRules).toContain('Card hierarchy detection');
      expect(diff.fixedIssues.length).toBeGreaterThan(0);
    });
  });

  describe('4. Duplicate Rule Detection & Validation (Sections 57 & 58)', () => {
    it('detects duplicate rule IDs across skills', () => {
      const registry = new SkillRegistry();

      const pkg1: SkillPackage = {
        manifest: {
          name: 'skill-one',
          displayName: 'Skill One',
          version: '1.0.0',
          description: '',
          author: 'Dev',
          license: 'MIT',
          source: { type: 'file', path: '1.md' },
        },
        rules: [
          {
            id: 'UI-CARD-014',
            version: '1.0.0',
            description: '',
            category: 'ui',
            severity: 'warning',
            sourceSkillId: 'skill-one',
            detect: () => [],
          },
        ],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'file', path: '1.md' },
        version: {
          skillId: 'skill-one',
          version: '1.0.0',
          contentHash: 'h1',
          installedAt: '',
          source: { type: 'file', path: '1.md' },
          ruleCount: 1,
        },
      };

      registry.register(pkg1);

      // Second skill attempting to reuse UI-CARD-014
      const pkg2: SkillPackage = {
        manifest: {
          name: 'skill-two',
          displayName: 'Skill Two',
          version: '1.0.0',
          description: '',
          author: 'Dev',
          license: 'MIT',
          source: { type: 'file', path: '2.md' },
        },
        rules: [
          {
            id: 'UI-CARD-014',
            version: '1.0.0',
            description: '',
            category: 'ui',
            severity: 'warning',
            sourceSkillId: 'skill-two',
            detect: () => [],
          },
        ],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'file', path: '2.md' },
        version: {
          skillId: 'skill-two',
          version: '1.0.0',
          contentHash: 'h2',
          installedAt: '',
          source: { type: 'file', path: '2.md' },
          ruleCount: 1,
        },
      };

      const validation = registry.validateSkill(pkg2);
      expect(validation.conflictCount).toBe(1);
      expect(validation.issues.some(i => i.type === 'warning' && i.ruleId === 'UI-CARD-014')).toBe(true);
    });
  });

  describe('5. Rule Statistics Tracking (Section 53)', () => {
    it('records findings produced, fixes applied, and false positive dismissals', () => {
      const registry = new SkillRegistry();
      const pkg: SkillPackage = {
        manifest: {
          name: 'stats-test',
          displayName: 'Stats Test',
          version: '1.0.0',
          description: '',
          author: '',
          license: 'MIT',
          source: { type: 'file', path: '' },
        },
        rules: [
          { id: 'r1', version: '1.0.0', description: '', category: 'ui', severity: 'warning', detect: () => [] },
        ],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'file', path: '' },
        version: {
          skillId: 'stats-test',
          version: '1.0.0',
          contentHash: 'h',
          installedAt: '',
          source: { type: 'file', path: '' },
          ruleCount: 1,
        },
      };

      registry.register(pkg);

      registry.recordFindingProduced('stats-test');
      registry.recordFindingProduced('stats-test');
      registry.recordFixApplied('stats-test');
      registry.recordFalsePositiveDismissal('stats-test');

      const updated = registry.getSkill('stats-test');
      expect(updated?.stats?.findingsProduced).toBe(2);
      expect(updated?.stats?.fixesApplied).toBe(1);
      expect(updated?.stats?.falsePositiveDismissals).toBe(1);
    });
  });
});
