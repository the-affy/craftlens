import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { CL_001_RULE } from '../../packages/rule-engine/src/rules/visual-slop/CL-001-low-contrast-text.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CL-001: Low Contrast Muted Text Slop', () => {
  it('should detect low-contrast gray text utilities and provide a safe fix', () => {
    const code = `
      export function Card() {
        return (
          <div className="p-4 bg-white">
            <h2 className="text-xl font-bold">Title</h2>
            <p className="text-gray-400">This text has washed-out low contrast.</p>
            <span className="text-zinc-400">Subtitle</span>
          </div>
        );
      }
    `;
    const filePath = '/src/Card.tsx';
    const parsed = parseSource(filePath, code);
    const findings = CL_001_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(2);
    expect(findings[0].ruleId).toBe('CL-001');
    expect(findings[0].fix).toBeDefined();
    expect(findings[0].fix?.changes[0].newText).toContain('text-slate-600');
    expect(findings[1].fix).toBeDefined();
  });

  it('should not flag disabled buttons or high contrast text', () => {
    const code = `
      export function Card() {
        return (
          <div className="p-4 bg-white">
            <h2 className="text-slate-900 font-bold">Title</h2>
            <p className="text-slate-600">High contrast accessible text.</p>
            <button disabled className="text-gray-400">Disabled button</button>
          </div>
        );
      }
    `;
    const filePath = '/src/Card.tsx';
    const parsed = parseSource(filePath, code);
    const findings = CL_001_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
