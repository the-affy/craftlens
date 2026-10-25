import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { CP_007_RULE } from '../../packages/rule-engine/src/rules/hierarchy/CP-007-excessive-card-usage.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CP-007: Excessive Card Usage', () => {
  it('flags container with 6 visually identical cards and provides structured alternatives', () => {
    const code = `
      export function FeaturesGrid() {
        return (
          <div className="grid grid-cols-3 gap-6">
            <Card>Feature A</Card>
            <Card>Feature B</Card>
            <Card>Feature C</Card>
            <Card>Feature D</Card>
            <Card>Feature E</Card>
            <Card>Feature F</Card>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/FeaturesGrid.tsx', code);
    const findings = CP_007_RULE.detect({
      filePath: '/src/FeaturesGrid.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CP-007');
    expect(findings[0].message).toContain('6 visually identical cards');
    expect(findings[0].diagnosis).toContain('different levels of importance');
    expect(findings[0].structuredRecommendation).toBeDefined();
    expect(findings[0].alternatives?.length).toBe(3);
    expect(findings[0].alternatives![0].title).toContain('Compact List');
    expect(findings[0].alternatives![1].title).toContain('Featured Item');
    expect(findings[0].alternatives![2].title).toContain('Grouped');
  });

  it('does not flag normal layout with 2 or 3 cards', () => {
    const code = `
      export function PricingCards() {
        return (
          <div className="grid grid-cols-3 gap-6">
            <Card>Basic Plan</Card>
            <Card>Pro Plan</Card>
            <Card>Enterprise Plan</Card>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/PricingCards.tsx', code);
    const findings = CP_007_RULE.detect({
      filePath: '/src/PricingCards.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
