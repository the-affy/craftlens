import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { VH_007_RULE } from '../../packages/rule-engine/src/rules/hierarchy/VH-007-multiple-primary-actions.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule VH-007: Multiple Primary Actions', () => {
  it('flags container with multiple primary CTA buttons and offers assisted fix to secondary', () => {
    const code = `
      export function HeroActions() {
        return (
          <div className="flex gap-4">
            <Button variant="primary">Get Started</Button>
            <Button variant="primary">Upgrade Plan</Button>
            <Button variant="primary">Contact Sales</Button>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/HeroActions.tsx', code);
    const findings = VH_007_RULE.detect({
      filePath: '/src/HeroActions.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('VH-007');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].diagnosis).toContain('primary visual prominence');
    expect(findings[0].alternatives).toBeDefined();
    expect(findings[0].alternatives!.length).toBeGreaterThanOrEqual(2);
    expect(findings[0].fix).toBeDefined();
    expect(findings[0].fix?.changes[0].newText).toContain('variant="secondary"');
  });

  it('does not flag when only one primary action is present alongside secondary or outline', () => {
    const code = `
      export function ProperHeroActions() {
        return (
          <div className="flex gap-4">
            <Button variant="primary">Get Started</Button>
            <Button variant="secondary">Documentation</Button>
            <Button variant="ghost">Learn More</Button>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/ProperHeroActions.tsx', code);
    const findings = VH_007_RULE.detect({
      filePath: '/src/ProperHeroActions.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
