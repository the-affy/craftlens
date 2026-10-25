import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { ID_001_RULE } from '../../packages/rule-engine/src/rules/intent/ID-001-decorative-without-purpose.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule ID-001: Decorative Element Without Purpose', () => {
  it('flags gratuitous decorative blur in operational dashboard view', () => {
    const code = `
      export function DashboardStats() {
        return (
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-purple-600 rounded-lg blur opacity-75" />
            <div className="relative bg-white p-6">Content</div>
          </div>
        );
      }
    `;
    const parsed = parseSource('/src/dashboard/stats.tsx', code);
    const findings = ID_001_RULE.detect({
      filePath: '/src/dashboard/stats.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('ID-001');
    expect(findings[0].intent?.category).toBe('dashboard');
    expect(findings[0].message).toContain('Gratuitous decorative glow/blur');

  });

  it('does not flag decorative elements on marketing landing pages', () => {
    const code = `
      export function MarketingHero() {
        return (
          <section className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-purple-600 rounded-lg blur opacity-75" />
            <h1>Welcome to Product</h1>
          </section>
        );
      }
    `;
    const parsed = parseSource('/src/marketing/Hero.tsx', code);
    const findings = ID_001_RULE.detect({
      filePath: '/src/marketing/Hero.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
