import { describe, it, expect } from 'vitest';
import { parseSource } from '../../packages/parser/src/index.js';
import { ID_005_RULE } from '../../packages/rule-engine/src/rules/intent/ID-005-information-without-decision.js';
import { createDefaultProjectContext } from '../../packages/core/src/index.js';

describe('Rule ID-005: Metric Information Without Decision Context', () => {
  it('flags isolated numbers in dashboard metric cards lacking delta or comparative context', () => {
    const code = `
      export function MetricView() {
        return (
          <Card className="p-4">
            <span className="text-sm font-medium">Total Revenue</span>
            <div className="text-3xl font-bold">$48,200</div>
          </Card>
        );
      }
    `;
    const parsed = parseSource('/src/dashboard/MetricView.tsx', code);
    const findings = ID_005_RULE.detect({
      filePath: '/src/dashboard/MetricView.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('ID-005');
    expect(findings[0].diagnosis).toContain('without comparison baseline');
  });

  it('does not flag metric cards that provide comparative delta or percentage trends', () => {
    const code = `
      export function ContextualMetricView() {
        return (
          <Card className="p-4">
            <span className="text-sm font-medium">Total Revenue</span>
            <div className="text-3xl font-bold">$48,200</div>
            <span className="text-xs text-green-600">+12% vs last month</span>
          </Card>
        );
      }
    `;
    const parsed = parseSource('/src/dashboard/ContextualMetricView.tsx', code);
    const findings = ID_005_RULE.detect({
      filePath: '/src/dashboard/ContextualMetricView.tsx',
      sourceCode: code,
      parsedAst: parsed,
      projectContext: createDefaultProjectContext(),
    });

    expect(findings.length).toBe(0);
  });
});
