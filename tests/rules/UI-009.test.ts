import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { UI_009_RULE } from '../../packages/rule-engine/src/rules/css/UI-009-fixed-container-width.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule UI-009: Hardcoded Viewport-Breaking Container Width', () => {
  it('should flag containers with large fixed width (>=640px) without responsive max-width', () => {
    const code = `
      export function LargeLayout() {
        return (
          <div>
            <div className="container p-4 w-[900px]">Content</div>
            <div style={{ width: '800px' }}>Fixed width</div>
          </div>
        );
      }
    `;
    const filePath = '/src/LargeLayout.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UI_009_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(2);
    expect(findings[0].ruleId).toBe('UI-009');
    expect(findings[1].ruleId).toBe('UI-009');
  });

  it('should not flag containers with responsive max-width or fluid width', () => {
    const code = `
      export function ResponsiveLayout() {
        return (
          <div>
            <div className="container p-4 max-w-4xl w-full">Fluid Container</div>
            <div style={{ width: '800px', maxWidth: '100%' }}>Responsive Box</div>
          </div>
        );
      }
    `;
    const filePath = '/src/ResponsiveLayout.tsx';
    const parsed = parseSource(filePath, code);
    const findings = UI_009_RULE.detect({
      filePath,
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
