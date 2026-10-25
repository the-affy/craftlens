import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { CP_008_RULE } from '../../packages/rule-engine/src/rules/hierarchy/CP-008-card-inside-card.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule CP-008: Card Inside Card', () => {
  it('flags nested Card component inside another Card', () => {
    const code = `
      export function NestedSurface() {
        return (
          <Card className="p-6">
            <h2>Overview</h2>
            <div>
              <Card className="p-4">Inner Detail Item</Card>
            </div>
          </Card>
        );
      }
    `;
    const parsed = parseSource('/src/NestedSurface.tsx', code);
    const findings = CP_008_RULE.detect({
      filePath: '/src/NestedSurface.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('CP-008');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].diagnosis).toContain('Card container nested inside another Card');
  });

  it('does not flag independent peer cards inside a clean grid', () => {
    const code = `
      export function PeerCards() {
        return (
          <div className="grid grid-cols-2 gap-4">
            <Card>Card 1</Card>
            <Card>Card 2</Card>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/PeerCards.tsx', code);
    const findings = CP_008_RULE.detect({
      filePath: '/src/PeerCards.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
