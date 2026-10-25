import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { CL_003_RULE } from '../../packages/rule-engine/src/rules/visual-slop/CL-003-harsh-neon-border.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CL-003: Harsh Neon Container Border Slop', () => {
  it('should detect decorative border-purple-500 and provide a clean fix', () => {
    const code = `
      export function FeatureCard() {
        return (
          <div className="p-6 border-purple-500 rounded-lg">
            <h3>Feature Title</h3>
          </div>
        );
      }
    `;
    const filePath = '/src/FeatureCard.tsx';
    const parsed = parseSource(filePath, code);
    const findings = CL_003_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CL-003');
    expect(findings[0].fix?.changes[0].newText).toContain('border-slate-200');
  });

  it('should not flag focus or error borders', () => {
    const code = `
      export function InputField() {
        return (
          <input className="border border-slate-300 focus:border-purple-500" />
        );
      }
    `;
    const filePath = '/src/InputField.tsx';
    const parsed = parseSource(filePath, code);
    const findings = CL_003_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
