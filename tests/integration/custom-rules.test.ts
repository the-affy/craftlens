import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseCustomRuleContent,
  createRuleFromDefinition,
  CustomRuleLoader,
  RuleEngine,
  RuleRegistry,
} from '../../packages/rule-engine/src/index.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';
import { parseSource } from '../../packages/parser/src/index.js';

describe('Integration: Custom User Rules', () => {
  it('parses declarative YAML custom rules correctly', () => {
    const yaml = `
id: BRAND-001
name: No gradients in dashboard
category: visual
description: Dashboard surfaces must use solid colors.
rationale: Gradients are reserved for marketing surfaces.
severity: warning
minimumAuditLevel: moderate
scope:
  include:
    - "src/dashboard/**"
detection:
  type: css
  pattern: gradient
recommendation:
  summary: Replace the gradient with an approved surface token.
  rationale: Dashboard surfaces should prioritize readability.
fix:
  type: assisted
  replacement: bg-surface-primary
`;

    const def = parseCustomRuleContent(yaml);
    expect(def.id).toBe('BRAND-001');
    expect(def.name).toBe('No gradients in dashboard');
    expect(def.category).toBe('visual');
    expect(def.severity).toBe('warning');
    expect(def.detection.type).toBe('css');
    expect(def.detection.pattern).toBe('gradient');
    expect(def.recommendation?.summary).toBe('Replace the gradient with an approved surface token.');
    expect(def.fix?.type).toBe('assisted');
  });

  it('evaluates CSS custom rule and produces identical finding model with recommendations and fix', () => {
    const yaml = `
id: BRAND-001
name: No gradients in dashboard
category: visual
description: Dashboard surfaces must use solid colors.
rationale: Gradients are reserved for marketing surfaces.
severity: warning
detection:
  type: css
  pattern: gradient
recommendation:
  summary: Replace gradient with approved surface token.
fix:
  type: assisted
  replacement: bg-slate-900
`;
    const def = parseCustomRuleContent(yaml);
    const rule = createRuleFromDefinition(def);

    const code = `
      export function AdminSurface() {
        return <div className="bg-gradient-to-r from-blue-500 to-purple-600">Admin Panel</div>;
      }
    `;

    const findings = rule.detect({
      filePath: '/virtual/src/dashboard/AdminSurface.tsx',
      sourceCode: code,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('BRAND-001');
    expect(findings[0].message).toBe('No gradients in dashboard');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].recommendation).toBe('Replace gradient with approved surface token.');
    expect(findings[0].fix).toBeDefined();
    expect(findings[0].fix?.changes[0].newText).toBe('bg-slate-900');
  });

  it('evaluates regex custom rules and detects patterns', () => {
    const jsonRule = JSON.stringify({
      id: 'SEC-CUSTOM',
      name: 'No hardcoded JWT secret tokens',
      category: 'security',
      description: 'Hardcoded secrets must not be checked into source.',
      rationale: 'Security risk.',
      severity: 'error',
      detection: {
        type: 'regex',
        pattern: 'jwt_secret_[a-zA-Z0-9]+',
      },
      recommendation: {
        summary: 'Read secret from process.env instead.',
      },
    });

    const def = parseCustomRuleContent(jsonRule);
    const rule = createRuleFromDefinition(def);

    const code = `const token = "jwt_secret_9988aacc";`;
    const findings = rule.detect({
      filePath: '/virtual/auth.ts',
      sourceCode: code,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('SEC-CUSTOM');
    expect(findings[0].severity).toBe('error');
  });

  it('evaluates AST custom rule matching specific JSX tags', () => {
    const yaml = `
id: NO-RAW-IMG
name: Use Next.js Image component instead of raw img
category: architecture
description: Raw <img> bypasses responsive image optimization.
rationale: Layout shift and large bundle downloads.
severity: warning
detection:
  type: ast
  pattern: <img>
recommendation:
  summary: Import Image from 'next/image'.
`;
    const def = parseCustomRuleContent(yaml);
    const rule = createRuleFromDefinition(def);

    const code = `
      export function Avatar() {
        return <img src="/avatar.png" alt="User avatar" />;
      }
    `;
    const parsed = parseSource('/src/Avatar.tsx', code);
    const findings = rule.detect({
      filePath: '/src/Avatar.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('NO-RAW-IMG');
    expect(findings[0].message).toContain('Next.js Image component');
  });

  it('runs custom rule seamlessly in RuleEngine alongside built-in rules', () => {
    const registry = new RuleRegistry();

    const customDef = parseCustomRuleContent(`
id: CUSTOM-001
name: Forbidden console.log in production code
category: code
description: Console logs must be removed before production.
rationale: Performance and information leakage.
severity: warning
detection:
  type: text
  pattern: console.log
recommendation:
  summary: Use dedicated logger service.
`);

    registry.register(createRuleFromDefinition(customDef));

    const engine = new RuleEngine(registry);
    const code = `
      export function calculate() {
        console.log("computing...");
        return 42;
      }
    `;

    const result = engine.analyze({
      filePath: '/src/calc.ts',
      sourceText: code,
    });

    expect(result.findings.length).toBe(1);
    expect(result.findings[0].ruleId).toBe('CUSTOM-001');
    expect(result.findings[0].recommendation).toBe('Use dedicated logger service.');
  });
});
