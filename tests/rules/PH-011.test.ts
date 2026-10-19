import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { PH_011_RULE } from '../../packages/rule-engine/src/rules/placeholder/PH-011-lorem-ipsum.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule PH-011: Lorem Ipsum Placeholder in UI', () => {
  it('should flag Lorem ipsum in JSX text (positive case)', () => {
    const code = `
      export function Article() {
        return (
          <div>
            <h1>Header</h1>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/Article.tsx', code);
    const findings = PH_011_RULE.detect({
      filePath: '/src/Article.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('PH-011');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should not flag real product copy (negative case)', () => {
    const code = `
      export function Article() {
        return (
          <div>
            <h1>Settings</h1>
            <p>Manage your account preferences, billing, and team members.</p>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/Article.tsx', code);
    const findings = PH_011_RULE.detect({
      filePath: '/src/Article.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });

  it('should ignore test spec files (false positive mitigation)', () => {
    const code = `
      test('renders dummy lorem ipsum text', () => {
        expect(render(<p>Lorem ipsum</p>)).toBeTruthy();
      });
    `;
    const parsed = parseSource('/src/Article.test.tsx', code);
    const findings = PH_011_RULE.detect({
      filePath: '/src/Article.test.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
