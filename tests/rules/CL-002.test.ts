import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { CL_002_RULE } from '../../packages/rule-engine/src/rules/visual-slop/CL-002-pure-black-slop.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CL-002: Harsh Pure Black Slop', () => {
  it('should detect text-black and provide a safe fix to slate-900', () => {
    const code = `
      export function Hero() {
        return (
          <div className="bg-white">
            <h1 className="text-black text-3xl">Uncalibrated Heading</h1>
          </div>
        );
      }
    `;
    const filePath = '/src/Hero.tsx';
    const parsed = parseSource(filePath, code);
    const findings = CL_002_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CL-002');
    expect(findings[0].fix?.changes[0].newText).toContain('text-slate-900');
  });

  it('should not flag refined dark neutrals', () => {
    const code = `
      export function Hero() {
        return (
          <div className="bg-white">
            <h1 className="text-slate-900 text-3xl">Refined Heading</h1>
          </div>
        );
      }
    `;
    const filePath = '/src/Hero.tsx';
    const parsed = parseSource(filePath, code);
    const findings = CL_002_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
