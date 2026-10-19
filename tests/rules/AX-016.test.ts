import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { AX_016_RULE } from '../../packages/rule-engine/src/rules/accessibility/AX-016-icon-button-name.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule AX-016: Icon Button Without Accessible Name', () => {
  it('should flag button containing icon without aria-label (positive case)', () => {
    const code = `
      export function CloseButton() {
        return (
          <button onClick={() => {}}>
            <svg><path d="M0 0" /></svg>
          </button>
        );
      }
    `;
    const parsed = parseSource('/test.tsx', code);
    const findings = AX_016_RULE.detect({
      filePath: '/test.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('AX-016');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].fix?.changes[0].newText).toContain('aria-label');
  });

  it('should not flag button with aria-label (negative case)', () => {
    const code = `
      export function CloseButton() {
        return (
          <button aria-label="Close" onClick={() => {}}>
            <svg><path d="M0 0" /></svg>
          </button>
        );
      }
    `;
    const parsed = parseSource('/test.tsx', code);
    const findings = AX_016_RULE.detect({
      filePath: '/test.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should not flag button with text content alongside icon (false positive mitigation)', () => {
    const code = `
      export function ActionButton() {
        return (
          <button onClick={() => {}}>
            <svg />
            <span>Save Changes</span>
          </button>
        );
      }
    `;
    const parsed = parseSource('/test.tsx', code);
    const findings = AX_016_RULE.detect({
      filePath: '/test.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
