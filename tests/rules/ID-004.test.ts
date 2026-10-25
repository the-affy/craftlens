import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { ID_004_RULE } from '../../packages/rule-engine/src/rules/intent/ID-004-cta-without-outcome.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule ID-004: Call To Action Without Outcome', () => {
  it('flags button without onClick or with dummy no-op handler', () => {
    const code = `
      export function Actions() {
        return (
          <div>
            <Button>Dead End Action</Button>
            <button onClick={() => {}}>Dummy Action</button>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/Actions.tsx', code);
    const findings = ID_004_RULE.detect({
      filePath: '/src/Actions.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(2);
    expect(findings[0].ruleId).toBe('ID-004');
    expect(findings[0].fix).toBeDefined();
    expect(findings[0].fix?.changes[0].newText).toContain('disabled');
  });

  it('does not flag buttons with valid handlers or type="submit"', () => {
    const code = `
      export function ValidActions() {
        return (
          <form onSubmit={e => e.preventDefault()}>
            <Button onClick={() => console.log('active')}>Save</Button>
            <button type="submit">Submit</button>
            <button disabled>Pending</button>
          </form>
        );
      }
    `;
    const parsed = parseSource('/src/ValidActions.tsx', code);
    const findings = ID_004_RULE.detect({
      filePath: '/src/ValidActions.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
