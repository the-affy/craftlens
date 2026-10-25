import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { UI_006_RULE } from '../../packages/rule-engine/src/rules/css/UI-006-transition-all-slop.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule UI-006: Blanket transition-all Slop', () => {
  it('should flag transition-all in className and inline style', () => {
    const code = `
      export function Card() {
        return (
          <div className="card shadow-md transition-all duration-300">
            <span style={{ transition: 'all 0.2s ease' }}>Hover me</span>
          </div>
        );
      }
    `;
    const filePath = '/src/Card.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UI_006_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(2);
    expect(findings[0].ruleId).toBe('UI-006');
    expect(findings[1].ruleId).toBe('UI-006');
  });

  it('should not flag targeted transitions like transition-colors or transition-transform', () => {
    const code = `
      export function Card() {
        return (
          <div className="card shadow-md transition-colors duration-200">
            <span style={{ transition: 'opacity 200ms ease, transform 200ms ease' }}>Hover me</span>
          </div>
        );
      }
    `;
    const filePath = '/src/Card.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UI_006_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
