import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { CSS_005_RULE } from '../../packages/rule-engine/src/rules/css/CSS-005-magic-z-index.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CSS-005: Magic Z-Index Escalation', () => {
  it('should flag Tailwind magic z-index classes like z-[9999] (positive case)', () => {
    const code = `
      export function Modal() {
        return <div className="fixed inset-0 z-[99999] bg-black/50" />;
      }
    `;
    const parsed = parseSource('/src/Modal.tsx', code);
    const findings = CSS_005_RULE.detect({
      filePath: '/src/Modal.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CSS-005');
    expect(findings[0].severity).toBe('warning');
  });

  it('should flag excessive inline style zIndex: 99999', () => {
    const code = `
      export function Overlay() {
        return <div style={{ zIndex: 99999, position: 'absolute' }} />;
      }
    `;
    const parsed = parseSource('/src/Overlay.tsx', code);
    const findings = CSS_005_RULE.detect({
      filePath: '/src/Overlay.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CSS-005');
  });

  it('should not flag standard z-index values (negative case)', () => {
    const code = `
      export function Dropdown() {
        return <div className="z-10 relative" style={{ zIndex: 20 }} />;
      }
    `;
    const parsed = parseSource('/src/Dropdown.tsx', code);
    const findings = CSS_005_RULE.detect({
      filePath: '/src/Dropdown.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
