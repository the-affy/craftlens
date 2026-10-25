import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { UX_017_RULE } from '../../packages/rule-engine/src/rules/functionality/UX-017-nested-interactive-elements.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule UX-017: Nested Interactive Elements', () => {
  it('should flag <button> containing an <a> link or <Link>', () => {
    const code = `
      export function BadNav() {
        return (
          <button onClick={() => console.log('click')}>
            <a href="/dashboard">Go to Dashboard</a>
          </button>
        );
      }
    `;
    const filePath = '/src/BadNav.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UX_017_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('UX-017');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('Nested interactive element');
  });

  it('should flag <a> containing a <button>', () => {
    const code = `
      export function BadLink() {
        return (
          <a href="/settings">
            <button>Settings</button>
          </a>
        );
      }
    `;
    const filePath = '/src/BadLink.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UX_017_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('UX-017');
  });

  it('should not flag non-nested interactive buttons and links', () => {
    const code = `
      export function GoodNav() {
        return (
          <div>
            <a href="/dashboard" className="btn btn-primary">Go to Dashboard</a>
            <button onClick={() => console.log('click')}>Action</button>
          </div>
        );
      }
    `;
    const filePath = '/src/GoodNav.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UX_017_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
