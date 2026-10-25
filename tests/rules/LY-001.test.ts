import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { LY_001_RULE } from '../../packages/rule-engine/src/rules/visual-slop/LY-001-centered-layout-slop.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule LY-001: Blindly Centered Layout Slop', () => {
  it('should detect forced centered layouts and provide a left-aligned fix', () => {
    const code = `
      export function ContentSection() {
        return (
          <section className="flex flex-col items-center justify-center text-center p-8">
            <h2>Detailed Article</h2>
            <p>Multiple paragraphs of text that are hard to scan when centered.</p>
          </section>
        );
      }
    `;
    const filePath = '/src/ContentSection.tsx';
    const parsed = parseSource(filePath, code);
    const findings = LY_001_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('LY-001');
    expect(findings[0].fix?.changes[0].newText).toContain('items-start text-left');
  });

  it('should not flag left-aligned layouts', () => {
    const code = `
      export function ContentSection() {
        return (
          <section className="flex flex-col items-start text-left p-8">
            <h2>Detailed Article</h2>
            <p>Natural left-anchored typography.</p>
          </section>
        );
      }
    `;
    const filePath = '/src/ContentSection.tsx';
    const parsed = parseSource(filePath, code);
    const findings = LY_001_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
