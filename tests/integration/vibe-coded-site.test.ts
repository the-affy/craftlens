import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '@craftlens/rule-engine';
import { FindingStore } from '@craftlens/core';

describe('Vibe-Coded Website UI/UX Slop Detection (Requirement 25 & 30)', () => {
  const registry = new RuleRegistry();
  registerDefaultRules(registry);
  const engine = new RuleEngine(registry);

  const testFilePath = path.resolve(__dirname, '../../craftlens-ui-benchmark/worst-vibe-coded-page/index.html');
  const sourceText = fs.readFileSync(testFilePath, 'utf-8');

  it('detects multiple high-level clustered UI/UX anti-patterns on obviously vibe-coded website', () => {
    const result = engine.analyze({
      filePath: testFilePath,
      sourceText,
    });

    // Zero UI findings is a failure
    console.log('RULE IDS:', result.findings.map(f => f.ruleId));
    expect(result.findings.length).toBeGreaterThanOrEqual(5);

    const ruleIds = result.findings.map(f => f.ruleId);
    const problemTitles = result.findings.map(f => f.problemTitle?.toLowerCase() || '');

    // 1. Everything is a card / Card-heavy layout (CP-007)
    expect(ruleIds).toContain('CP-007');
    expect(problemTitles.some(t => t.includes('card'))).toBe(true);

    // 2. Generic / template-driven composition (UI-015)
    expect(ruleIds).toContain('UI-015');

    // 3. AI-style visual pattern stack (UI-016)
    expect(ruleIds).toContain('UI-016');

    // 4. Trend stacking (UI-013)
    expect(ruleIds).toContain('UI-013');

    // 5. Visual treatment overload (UI-014)
    expect(ruleIds).toContain('UI-014');

    // 6. Generic CTA language (CP-002)
    expect(ruleIds).toContain('CP-002');

    // 7. Badge saturation (UI-017)
    expect(ruleIds).toContain('UI-017');

    // 8. Possible unsupported metric / fake product signals (UI-019)
    expect(ruleIds).toContain('UI-019');
  });

  it('populates senior reviewer 4-question model on all detected findings', () => {
    const result = engine.analyze({
      filePath: testFilePath,
      sourceText,
    });

    for (const f of result.findings) {
      expect(f.problemTitle).toBeDefined();
      expect(f.problemTitle!.length).toBeGreaterThan(0);
      expect(f.whatIsWrong).toBeDefined();
      expect(f.whatIsWrong!.length).toBeGreaterThan(0);
      expect(f.whyItMatters).toBeDefined();
      expect(f.whyItMatters!.length).toBeGreaterThan(0);
      expect(f.howToFix).toBeDefined();
      expect(f.howToFix!.length).toBeGreaterThan(0);
      expect(f.evidence.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('populates Sidebar Findings under UI/UX category in FindingStore', () => {
    const result = engine.analyze({
      filePath: testFilePath,
      sourceText,
    });

    const store = new FindingStore();
    store.setFindingsForFile(testFilePath, result.findings);

    const categorized = store.getSidebarFindingsByCategory();
    expect(categorized.ui.length).toBeGreaterThanOrEqual(5);

    const uiTitles = categorized.ui.map(f => f.title.toLowerCase());
    expect(uiTitles.some(t => t.includes('card'))).toBe(true);
    expect(uiTitles.some(t => t.includes('template'))).toBe(true);
    expect(uiTitles.some(t => t.includes('trend'))).toBe(true);
  });
});
