import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { UX_018_RULE } from '../../packages/rule-engine/src/rules/accessibility/UX-018-missing-form-label.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule UX-018: Missing Form Field Label', () => {
  it('should flag inputs with placeholder but no label or aria-label', () => {
    const code = `
      export function EmailForm() {
        return (
          <form>
            <input type="text" placeholder="Enter your email address" />
          </form>
        );
      }
    `;
    const filePath = '/src/EmailForm.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UX_018_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('UX-018');
    expect(findings[0].message).toContain('placeholder without a persistent label');
  });

  it('should not flag inputs with associated label, aria-label, or title', () => {
    const code = `
      export function ValidForm() {
        return (
          <form>
            <label htmlFor="user-email">Email Address</label>
            <input id="user-email" type="text" placeholder="name@example.com" />
            <input type="text" placeholder="Search" aria-label="Search items" />
            <label>
              Username
              <input type="text" placeholder="user123" />
            </label>
          </form>
        );
      }
    `;
    const filePath = '/src/ValidForm.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UX_018_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
