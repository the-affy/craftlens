import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { CX_013_RULE } from '../../packages/rule-engine/src/rules/consistency/CX-013-existing-component-reused.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CX-013: Existing Component Should Be Reused', () => {
  it('flags ad-hoc styled <button> when project has an existing Button component and offers replacement', () => {
    const code = `
      export function CustomHeader() {
        return (
          <header>
            <button className="px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700">
              Submit Form
            </button>
          </header>
        );
      }
    `;
    const parsed = parseSource('/src/pages/CustomHeader.tsx', code);
    const context = createDefaultProjectContext();
    context.baseline.components = ['Button', 'Modal'];

    const findings = CX_013_RULE.detect({
      filePath: '/src/pages/CustomHeader.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: context,
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CX-013');
    expect(findings[0].message).toContain('Button component already exists');
    expect(findings[0].fix).toBeDefined();
    expect(findings[0].fix?.changes[0].newText).toBe('Button');
  });

  it('does not flag when the shared Button component is properly imported and used', () => {
    const code = `
      import { Button } from '@/components/ui/Button';
      export function ValidHeader() {
        return (
          <header>
            <Button>Submit Form</Button>
          </header>
        );
      }
    `;
    const parsed = parseSource('/src/pages/ValidHeader.tsx', code);
    const findings = CX_013_RULE.detect({
      filePath: '/src/pages/ValidHeader.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
