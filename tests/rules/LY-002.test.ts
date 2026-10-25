import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { LY_002_RULE } from '../../packages/rule-engine/src/rules/visual-slop/LY-002-non-responsive-grid.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule LY-002: Non-Responsive Multi-Column Grid Slop', () => {
  it('should detect rigid multi-column grid without responsive fallbacks and provide a fix', () => {
    const code = `
      export function GridSection() {
        return (
          <div className="grid grid-cols-3 gap-6">
            <div>Card 1</div>
            <div>Card 2</div>
            <div>Card 3</div>
          </div>
        );
      }
    `;
    const filePath = '/src/GridSection.tsx';
    const parsed = parseSource(filePath, code);
    const findings = LY_002_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('LY-002');
    expect(findings[0].fix?.changes[0].newText).toBe('grid-cols-1 md:grid-cols-3');
  });

  it('should not flag mobile-first responsive grid layouts', () => {
    const code = `
      export function ResponsiveGridSection() {
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>Card 1</div>
            <div>Card 2</div>
            <div>Card 3</div>
          </div>
        );
      }
    `;
    const filePath = '/src/ResponsiveGridSection.tsx';
    const parsed = parseSource(filePath, code);
    const findings = LY_002_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
