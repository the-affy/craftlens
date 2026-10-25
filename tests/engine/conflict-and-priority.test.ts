import { describe, it, expect } from 'vitest';
import { ConflictResolver } from '../../packages/rule-engine/src/engine/conflict-resolver.js';
import { RuleResolver } from '../../packages/rule-engine/src/engine/rule-resolver.js';
import { Rule, SkillPackage } from '@craftlens/core';

describe('Rule Conflict Engine, Skill Precedence & Strategy Merging', () => {
  const conflictResolver = new ConflictResolver();
  const ruleResolver = new RuleResolver();

  describe('1. Deterministic Skill Priority Resolution (Sections 6 & 25)', () => {
    it('Project-specific user rule beats project skill beats user skill beats built-in rule', () => {
      const projectRule: Rule = {
        id: 'project.spacing.6px',
        version: '1.0.0',
        description: 'This product intentionally uses 6px rhythm.',
        category: 'css',
        severity: 'warning',
        sourceSkillId: 'project-rules',
        detect: () => [],
      };

      const userRule: Rule = {
        id: 'user.spacing',
        version: '1.0.0',
        description: 'User spacing preference',
        category: 'css',
        severity: 'warning',
        sourceSkillId: 'my-user-skill',
        detect: () => [],
      };

      const builtinRule: Rule = {
        id: 'CX-004',
        version: '1.0.0',
        description: 'Standard 8px spacing rhythm.',
        category: 'css',
        severity: 'warning',
        sourceSkillId: 'component-reference',
        detect: () => [],
      };

      const projectScore = conflictResolver.getRulePrecedence(projectRule);
      const userScore = conflictResolver.getRulePrecedence(userRule);
      const builtinScore = conflictResolver.getRulePrecedence(builtinRule);

      expect(projectScore).toBeGreaterThan(userScore);
      expect(userScore).toBeGreaterThan(builtinScore);

      // In a direct conflict, projectRule wins over builtinRule!
      const resolution = conflictResolver.resolveRuleConflict(builtinRule, projectRule);
      expect(resolution.effectiveRule.id).toBe('project.spacing.6px');
      expect(resolution.conflictDetected).toBe(true);
    });
  });

  describe('2. Harmonious Recommendation Merging (Sections 33 & 61)', () => {
    it('combines recommendations instead of showing conflicting advice', () => {
      const cardRepetitionRule: Rule = {
        id: 'UI-CARD-014',
        name: 'Repeated Card Treatment',
        version: '1.3.0',
        description: 'Reduce template-like repetition.',
        category: 'ui',
        severity: 'warning',
        sourceSkillId: 'anti-ai-ui',
        recommendation: {
          summary: 'Reduce repeated card treatment across dashboard modules.',
          why: 'Overusing cards flattens information hierarchy.',
          howToFix: 'Use whitespace grouping and subtle dividers.',
        },
        detect: () => [],
      };

      const companyElevationRule: Rule = {
        id: 'UI-CARD-014',
        name: 'Company Card Elevation Hierarchy',
        version: '2.1.0',
        description: 'Primary cards use elevation 2.',
        category: 'ui',
        severity: 'warning',
        sourceSkillId: 'company-brand',
        recommendation: {
          summary: 'Primary cards use elevation 2; secondary use elevation 0 or 1.',
          why: 'Enforces brand elevation hierarchy.',
          howToFix: 'Apply elevation-2 to primary summary cards.',
        },
        detect: () => [],
      };

      const merged = conflictResolver.mergeRecommendations(companyElevationRule, cardRepetitionRule);

      // Primary rule recommendations take lead and are harmonized
      expect(merged.summary).toContain('Primary cards use elevation 2');
      expect(merged.summary).toContain('Harmonized with anti-ai-ui');
      expect(merged.why).toBeDefined();
      expect(merged.howToFix).toBeDefined();
    });
  });

  describe('3. Fix Strategy Merging Safety (Section 62)', () => {
    it('demotes to assisted/manual when two safe edits have conflicting replacements', () => {
      const ruleA: Rule = {
        id: 'rule.a',
        version: '1.0.0',
        description: 'Replace with 8px',
        category: 'css',
        severity: 'warning',
        fix: 'safe',
        fixStrategy: {
          id: 'fix_a',
          title: 'Apply 8px',
          description: 'Set margin to 8px',
          type: 'safe',
          replacement: 'margin: 8px;',
        },
        detect: () => [],
      };

      const ruleB: Rule = {
        id: 'rule.b',
        version: '1.0.0',
        description: 'Replace with 6px',
        category: 'css',
        severity: 'warning',
        fix: 'safe',
        fixStrategy: {
          id: 'fix_b',
          title: 'Apply 6px',
          description: 'Set margin to 6px',
          type: 'safe',
          replacement: 'margin: 6px;',
        },
        detect: () => [],
      };

      const mergedStrategy = conflictResolver.mergeFixStrategies(ruleA, ruleB);

      // Should NOT auto-apply! Demoted to assisted
      expect(mergedStrategy?.type).toBe('assisted');
      expect(mergedStrategy?.description).toContain('Manual review advised');
    });
  });

  describe('4. Effective Rule Graph (Section 60)', () => {
    it('resolves effective rules given active skills and execution mode', () => {
      const builtinSkill: SkillPackage = {
        manifest: {
          name: 'craftlens-core',
          displayName: 'Core',
          version: '1.0.0',
          description: '',
          author: '',
          license: 'MIT',
          source: { type: 'builtin', id: 'craftlens-core' },
        },
        rules: [
          { id: 'AP-008', version: '1.0.0', description: '', category: 'code', severity: 'warning', detect: () => [] },
          { id: 'AP-014', version: '1.0.0', description: '', category: 'code', severity: 'warning', detect: () => [] },
        ],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'builtin', id: 'craftlens-core' },
        version: { skillId: 'craftlens-core', version: '1.0.0', contentHash: 'h', installedAt: '', source: { type: 'builtin', id: 'craftlens-core' }, ruleCount: 2 },
      };

      const userSkill: SkillPackage = {
        manifest: {
          name: 'user-rules',
          displayName: 'User Rules',
          version: '1.0.0',
          description: '',
          author: '',
          license: 'Proprietary',
          source: { type: 'file', path: 'user.md' },
        },
        rules: [
          { id: 'user.custom', version: '1.0.0', description: '', category: 'ui', severity: 'error', detect: () => [] },
        ],
        patterns: [],
        recommendations: [],
        fixStrategies: [],
        guidance: [],
        source: { type: 'file', path: 'user.md' },
        version: { skillId: 'user-rules', version: '1.0.0', contentHash: 'h2', installedAt: '', source: { type: 'file', path: 'user.md' }, ruleCount: 1 },
      };

      // Combined mode: both builtin and user rules
      const combinedRules = ruleResolver.resolveEffectiveRules({
        skills: [builtinSkill, userSkill],
        rawRules: [],
        executionMode: 'combined',
        disabledRules: new Set(),
      });
      expect(combinedRules.map(r => r.id)).toEqual(['AP-008', 'AP-014', 'user.custom']);

      // Custom mode: only user rules
      const customOnlyRules = ruleResolver.resolveEffectiveRules({
        skills: [builtinSkill, userSkill],
        rawRules: [],
        executionMode: 'custom',
        disabledRules: new Set(),
      });
      expect(customOnlyRules.map(r => r.id)).toEqual(['user.custom']);

      // Builtin mode: only builtin rules
      const builtinOnlyRules = ruleResolver.resolveEffectiveRules({
        skills: [builtinSkill, userSkill],
        rawRules: [],
        executionMode: 'builtin',
        disabledRules: new Set(),
      });
      expect(builtinOnlyRules.map(r => r.id)).toEqual(['AP-008', 'AP-014']);
    });
  });
});
