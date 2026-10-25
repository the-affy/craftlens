import { describe, it, expect } from 'vitest';
import { CX_005_RULE } from '../../packages/rule-engine/src/rules/consistency/CX-005-radius-violates-system.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CX-005: Border Radius Scale Violation', () => {
  it('flags arbitrary radius like rounded-[23px] and snaps to nearest approved token', () => {
    const code = `
      export function Card() {
        return <div className="rounded-[23px] border bg-white">Card</div>;
      }
    `;
    const context = createDefaultProjectContext();
    context.baseline.radius = [4, 8, 12, 16];

    const findings = CX_005_RULE.detect({
      filePath: '/src/Card.tsx',
      sourceCode: code,
      projectContext: context,
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CX-005');
    expect(findings[0].fix?.changes[0].newText).toBe('rounded-[16px]');
  });

  it('does not flag standard Tailwind radius classes like rounded-lg or rounded-md', () => {
    const code = `
      export function Card() {
        return <div className="rounded-lg rounded-md border">Card</div>;
      }
    `;
    const findings = CX_005_RULE.detect({
      filePath: '/src/Card.tsx',
      sourceCode: code,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
