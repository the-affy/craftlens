import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { UX_019_RULE } from '../../packages/rule-engine/src/rules/functionality/UX-019-unspecified-button-type.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule UX-019: Unspecified Button Type Inside Form', () => {
  it('should flag <button> inside <form> without explicit type attribute', () => {
    const code = `
      export function EditProfile() {
        return (
          <form onSubmit={() => console.log('submit')}>
            <button onClick={() => console.log('cancel')}>Cancel</button>
          </form>
        );
      }
    `;
    const filePath = '/src/EditProfile.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UX_019_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('UX-019');
    expect(findings[0].fix).toBeDefined();
    expect(findings[0].fix?.changes[0].newText).toContain('type="button"');
  });

  it('should not flag <button> with explicit type="button" or type="submit"', () => {
    const code = `
      export function EditProfile() {
        return (
          <form onSubmit={() => console.log('submit')}>
            <button type="button" onClick={() => console.log('cancel')}>Cancel</button>
            <button type="submit">Save</button>
          </form>
        );
      }
    `;
    const filePath = '/src/EditProfile.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UX_019_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
