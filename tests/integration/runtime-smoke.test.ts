import { describe, it, expect } from 'vitest';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '../../packages/rule-engine/src/index.js';
import { DEFAULT_CONFIG } from '../../packages/config/src/index.js';
import { createDefaultProjectContext, AuditStorageManager } from '../../packages/core/src/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Runtime Smoke Test: End-to-End Extension Workflow', () => {
  const registry = new RuleRegistry();
  registerDefaultRules(registry);
  const engine = new RuleEngine(registry);
  const projectContext = createDefaultProjectContext();

  it('detects multiple deliberate issues on problematic component, then clears them when fixed', () => {
    // 1. Deliberately problematic code
    const problematicCode = `
import React, { useState, useEffect } from 'react';

function Icon() {
  return <svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" /></svg>;
}

export function Example({ user }: { user: any }) {
  const [name, setName] = useState("");

  // RE-001: Effect for derived value
  useEffect(() => {
    setName(user.name);
  }, [user]);

  // CD-001: Chained type assertion
  const profile = (user as any) as { id: string };

  // SEC-001: Exposed API secret
  const apiKey = "sk-proj-abcdef0123456789abcdef0123456789";

  return (
    <div>
      {/* AX-016: Icon button without accessible name */}
      <button onClick={() => console.log("x")}>
        <Icon />
      </button>
      <span>{name} - {profile.id}</span>
    </div>
  );
}
`;

    const smokeFilePath = '/workspace/src/Example.tsx';
    const initialResult = engine.analyze({
      filePath: smokeFilePath,
      sourceText: problematicCode,
      config: {
        ...DEFAULT_CONFIG,
        severity: 'warning',
        auditLevel: 'moderate',
      },
      projectContext,
    });

    const ruleIds = initialResult.findings.map(f => f.ruleId);

    // Verify RE-001, AX-016, CD-001, and SEC-001 are detected
    expect(ruleIds).toContain('RE-001');
    expect(ruleIds).toContain('AX-016');
    expect(ruleIds).toContain('CD-001');
    expect(ruleIds).toContain('SEC-001');

    // Verify finding contracts
    const re001Finding = initialResult.findings.find(f => f.ruleId === 'RE-001')!;
    expect(re001Finding.severity).toBe('warning');
    expect(re001Finding.recommendation).toContain('Compute the value directly during render');

    const ax016Finding = initialResult.findings.find(f => f.ruleId === 'AX-016')!;
    expect(ax016Finding.severity).toBe('error');

    const sec001Finding = initialResult.findings.find(f => f.ruleId === 'SEC-001')!;
    expect(sec001Finding.severity).toBe('blocker');

    // 2. Fixed code (user resolves the issues)
    const fixedCode = `
import React from 'react';

function Icon() {
  return <svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" /></svg>;
}

export function Example({ user }: { user: { name: string; id: string } }) {
  // Fixed: Compute directly during render
  const name = user.name;
  const profile = user;
  const apiKey = process.env.API_KEY;

  return (
    <div>
      {/* Fixed: Accessible aria-label added */}
      <button aria-label="Perform action" onClick={() => console.log("x")}>
        <Icon />
      </button>
      <span>{name} - {profile.id}</span>
    </div>
  );
}
`;

    const fixedResult = engine.analyze({
      filePath: smokeFilePath,
      sourceText: fixedCode,
      config: {
        ...DEFAULT_CONFIG,
        severity: 'warning',
        auditLevel: 'moderate',
      },
      projectContext,
    });

    // All targeted findings disappear when code is fixed!
    const fixedRuleIds = fixedResult.findings.map(f => f.ruleId);
    expect(fixedRuleIds).not.toContain('RE-001');
    expect(fixedRuleIds).not.toContain('AX-016');
    expect(fixedRuleIds).not.toContain('CD-001');
    expect(fixedRuleIds).not.toContain('SEC-001');
    expect(fixedResult.findings.length).toBe(0);
  });

  it('updates master checklist automatically between problematic and fixed state', () => {
    const tempDir = path.resolve(__dirname, '../.tmp-smoke-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      const storage = new AuditStorageManager(tempDir);
      storage.ensureDefaultProjectConfig();

      const configPath = path.join(tempDir, '.craftlens', 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const parsedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(parsedConfig.autoAudit).toBe(true);
      expect(parsedConfig.defaultAuditLevel).toBe('moderate');

      // Sync audit with findings
      const initialFinding = {
        ruleId: 'AX-016',
        message: 'Icon button without accessible name',
        severity: 'error' as const,
        confidence: 0.95,
        location: {
          filePath: '/workspace/Button.tsx',
          start: { line: 10, column: 1, offset: 100 },
          end: { line: 10, column: 20, offset: 120 },
        },
        evidence: [],
      };

      const { checklist: audit1 } = storage.syncAudit(projectContext, [initialFinding], 'moderate');
      expect(audit1.summary.errors).toBe(1);
      expect(audit1.summary.healthScore).toBeLessThan(100);

      // Now sync with zero findings (issue resolved)
      const { checklist: audit2 } = storage.syncAudit(projectContext, [], 'moderate');
      expect(audit2.summary.errors).toBe(0);
      expect(audit2.summary.healthScore).toBe(100);

      // Verify checklist.md reflects passed status
      const checklistMdPath = path.join(tempDir, '.craftlens', 'checklist.md');
      const mdContent = fs.readFileSync(checklistMdPath, 'utf-8');
      expect(mdContent).toContain('`PASSED`');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects high-impact UI slops and UX slops on typical AI generated components', () => {
    const slopComponent = `
      import React from 'react';

      export function SlopDashboard() {
        return (
          /* UI-009: Hardcoded viewport-breaking 900px container */
          <div className="container p-4 w-[900px]">
            {/* UI-006: Blanket transition-all performance slop */}
            <div className="card shadow-lg transition-all duration-300">
              <form onSubmit={e => e.preventDefault()}>
                {/* UX-018: Disappearing placeholder without label */}
                <input type="text" placeholder="Enter recipient email" />

                {/* UX-019: Secondary button without type="button" inside form */}
                <button onClick={() => console.log('cancel')}>Cancel</button>

                {/* UX-017: Nested interactive link inside button */}
                <button>
                  <a href="/docs">Help Documentation</a>
                </button>
              </form>
            </div>
          </div>
        );
      }
    `;

    const filePath = '/workspace/src/SlopDashboard.tsx';
    const result = engine.analyze({
      filePath,
      sourceText: slopComponent,
      config: {
        ...DEFAULT_CONFIG,
        severity: 'suggestion',
        auditLevel: 'moderate',
      },
      projectContext,
    });

    const ruleIds = result.findings.map(f => f.ruleId);

    // Verify all UI and UX slops are accurately detected
    expect(ruleIds).toContain('UI-009'); // Hardcoded fixed width
    expect(ruleIds).toContain('UI-006'); // transition-all layout thrashing
    expect(ruleIds).toContain('UX-018'); // Missing form field label
    expect(ruleIds).toContain('UX-019'); // Unspecified button type inside form
    expect(ruleIds).toContain('UX-017'); // Nested interactive controls

    // Verify finding 4-question model contents
    const ux017 = result.findings.find(f => f.ruleId === 'UX-017')!;
    expect(ux017.problemTitle).toBe('Nested Interactive Elements');
    expect(ux017.whyItMatters).toContain('HTML5 interactive content must not have interactive content descendants');
    expect(ux017.howToFix).toBeDefined();

    const ux018 = result.findings.find(f => f.ruleId === 'UX-018')!;
    expect(ux018.whyItMatters).toContain('Disappearing placeholders');

    const ux019 = result.findings.find(f => f.ruleId === 'UX-019')!;
    expect(ux019.fix).toBeDefined();
    expect(ux019.fix?.changes[0].newText).toContain('type="button"');

    const ui006 = result.findings.find(f => f.ruleId === 'UI-006')!;
    expect(ui006.whyItMatters).toContain('reflow');

    const ui009 = result.findings.find(f => f.ruleId === 'UI-009')!;
    expect(ui009.whyItMatters).toContain('mobile usability');
  });
});

