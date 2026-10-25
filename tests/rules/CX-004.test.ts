import { describe, it, expect } from 'vitest';
import { CX_004_RULE } from '../../packages/rule-engine/src/rules/consistency/CX-004-spacing-scale-violation.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CX-004: Spacing Scale Violation', () => {
  it('flags arbitrary spacing like p-[17px] and snaps to nearest approved token', () => {
    const code = `
      export function Box() {
        return <div className="p-[17px] gap-[29px]">Hello</div>;
      }
    `;
    const context = createDefaultProjectContext();
    context.baseline.spacing = [4, 8, 12, 16, 24, 32];

    const findings = CX_004_RULE.detect({
      filePath: '/src/Box.tsx',
      sourceCode: code,
      projectContext: context,
    });

    expect(findings.length).toBe(2);
    expect(findings[0].ruleId).toBe('CX-004');
    expect(findings[0].fix?.changes[0].newText).toBe('p-[16px]');
    expect(findings[1].fix?.changes[0].newText).toBe('gap-[32px]');
  });

  it('does not flag standard spacing values like p-4, m-2, gap-6', () => {
    const code = `
      export function Box() {
        return <div className="p-4 gap-6 m-2">Standard Spacing</div>;
      }
    `;
    const findings = CX_004_RULE.detect({
      filePath: '/src/Box.tsx',
      sourceCode: code,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
