import { describe, it, expect } from 'vitest';
import {
  CraftLensRulesEngine,
  RuleRegistry,
  registerDefaultRules,
} from '@craftlens/rule-engine';
import {
  AnalysisContext,
  SkillPackage,
  createDefaultProjectContext,
} from '@craftlens/core';
import { parseSource } from '@craftlens/parser';

describe('CraftLensRulesEngine (Canonical Engine Architecture)', () => {
  it('implements RulesEngineContract and manages loaded skills and rules', async () => {
    const registry = new RuleRegistry();
    registerDefaultRules(registry);

    const engine = new CraftLensRulesEngine(registry);
    engine.getSkillManager().initBuiltinSkills(registry.getAllRules());

    const skills = engine.getSkills();
    expect(skills.length).toBe(9);

    const rules = engine.getRules();
    expect(rules.length).toBeGreaterThan(30);

    // Disable a rule and verify it is omitted from getRules()
    await engine.disableRule('AP-008');
    const filtered = engine.getRules();
    expect(filtered.some(r => r.id === 'AP-008')).toBe(false);

    // Re-enable rule
    await engine.enableRule('AP-008');
    const restored = engine.getRules();
    expect(restored.some(r => r.id === 'AP-008')).toBe(true);
  });

  it('Requirement 30: explain() returns Senior Reviewer 4-question breakdown', async () => {
    const registry = new RuleRegistry();
    registerDefaultRules(registry);

    const engine = new CraftLensRulesEngine(registry);
    engine.getSkillManager().initBuiltinSkills(registry.getAllRules());

    const explanation = await engine.explain('AP-008');
    expect(explanation.rule.id).toBe('AP-008');
    expect(explanation.detects).toBeDefined();
    expect(explanation.whyItMatters).toBeDefined();
    expect(explanation.recommendation).toBeDefined();
    expect(explanation.fixType).toBeDefined();
  });

  it('captures multiple instances and stamps skill provenance on findings (Sections 18, 41, 64)', async () => {
    const registry = new RuleRegistry();
    registerDefaultRules(registry);

    const engine = new CraftLensRulesEngine(registry);
    engine.getSkillManager().initBuiltinSkills(registry.getAllRules());

    const code = `
      export function MultiLorem() {
        return (
          <div>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
            <p>Lorem ipsum dolor sit amet, sed do eiusmod tempor.</p>
          </div>
        );
      }
    `;

    const parsedAst = parseSource('/src/MultiLorem.tsx', code);
    const context: AnalysisContext = {
      filePath: '/src/MultiLorem.tsx',
      sourceCode: code,
      parsedAst,
      projectContext: createDefaultProjectContext(),
    };

    const findings = await engine.analyze(context, 'easy');
    const loremFindings = findings.filter(f => f.ruleId === 'PH-011');

    expect(loremFindings.length).toBeGreaterThanOrEqual(2);

    for (const finding of loremFindings) {
      // Skill provenance stamped
      expect(finding.sourceSkillId).toBe('craftlens-core');
      expect(finding.sourceSkillVersion).toBe('1.0.0');
      expect(finding.ruleVersion).toBe('1.0.0');

      // Instances array populated with multiple locations
      expect(finding.instances).toBeDefined();
      expect(finding.instances!.length).toBeGreaterThanOrEqual(2);
      expect(finding.instances![0].id).toContain('PH-011_inst_');
    }
  });

  it('supports pluggable providers without parallel engines (Section 37)', () => {
    const engine = new CraftLensRulesEngine();

    const mockRuleProvider = {
      getRules: () => [
        {
          id: 'plug.test',
          version: '1.0.0',
          description: 'Pluggable test rule',
          category: 'ui' as const,
          severity: 'warning' as const,
          sourceSkillId: 'plug-skill',
          detect: () => [],
        },
      ],
    };

    engine.addRuleProvider(mockRuleProvider);
    const rules = engine.getRules();
    expect(rules.some(r => r.id === 'plug.test')).toBe(true);
  });
});
