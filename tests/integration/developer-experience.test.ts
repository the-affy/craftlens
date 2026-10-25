import { describe, it, expect } from 'vitest';
import { RuleRegistry, RuleEngine, registerDefaultRules } from '../../packages/rule-engine/src/index.js';
import { DEFAULT_CONFIG } from '../../packages/config/src/index.js';
import {
  createDefaultProjectContext,
  FindingStore,
  computeFindingFingerprint,
  computeStructuralFingerprint,
  formatHumanLocation,
  formatLocationShort,
  createProjectLevelLocation,
  calculateHealthScore,
  generateMasterChecklist,
  formatChecklistMarkdown,
  Finding,
} from '../../packages/core/src/index.js';

describe('Senior Engineer Developer Experience & Finding Model', () => {
  const registry = new RuleRegistry();
  registerDefaultRules(registry);
  const engine = new RuleEngine(registry);
  const projectContext = createDefaultProjectContext();

  it('1. Finding Location Contract: exact line, column, range, and human formatting', () => {
    const codeWithSwallowedError = `// Line 1
function testError() {
  try {
    dangerousOperation();
  } catch (err) {
    // silently swallowed
  }
}
`;
    const filePath = '/workspace/src/hooks/useSettings.ts';
    const result = engine.analyze({
      filePath,
      sourceText: codeWithSwallowedError,
      config: { ...DEFAULT_CONFIG, severity: 'warning' },
      projectContext,
    });

    const finding = result.findings.find(f => f.ruleId === 'AP-008');
    expect(finding).toBeDefined();
    if (!finding) return;

    // Check 0-based to 1-based coordinates
    expect(finding.location.filePath).toBe(filePath);
    expect(finding.location.start.line).toBeGreaterThanOrEqual(1);
    expect(finding.location.start.column).toBeGreaterThanOrEqual(1);
    expect(finding.location.end.line).toBeGreaterThanOrEqual(finding.location.start.line);
    expect(finding.location.end.column).toBeGreaterThanOrEqual(1);

    // Human location output: 1-based, clean, never "Unknown location"
    const humanLoc = formatHumanLocation(finding.location);
    expect(humanLoc).not.toContain('Unknown');
    expect(humanLoc).toBe('Line 5, column 5');

    const shortLoc = formatLocationShort(finding.location);
    expect(shortLoc).toBe('5:5');

    // Test project-level location
    const projectLoc = createProjectLevelLocation('package.json');
    expect(projectLoc.isProjectLevel).toBe(true);
    expect(formatHumanLocation(projectLoc)).toBe('Project-level finding');
    expect(formatLocationShort(projectLoc)).toBe('Project-level');
  });

  it('2. Senior Reviewer 4 Questions Contract: what, where, why, and howToFix', () => {
    const code = `
function handleData(input: any) {
  try {
    process(input);
  } catch (e) {
  }
}
`;
    const result = engine.analyze({
      filePath: '/workspace/src/handler.ts',
      sourceText: code,
      config: { ...DEFAULT_CONFIG, severity: 'warning' },
      projectContext,
    });

    const ap008 = result.findings.find(f => f.ruleId === 'AP-008');
    expect(ap008).toBeDefined();
    if (!ap008) return;

    // 1. What is wrong?
    expect(ap008.problemTitle).toBe('Error handling');
    expect(ap008.whatIsWrong.toLowerCase()).toContain('error is caught');

    // 2. Where is it?
    expect(ap008.location.filePath).toBe('/workspace/src/handler.ts');
    expect(ap008.location.start.line).toBe(5);

    // 3. Why does it matter?
    expect(ap008.whyItMatters).toBeDefined();
    expect(ap008.whyItMatters.toLowerCase()).toContain('disappear silently');

    // 4. How should I fix it?
    expect(ap008.howToFix).toBeDefined();
    expect(ap008.howToFix).toContain('Handle the error explicitly');
    expect(ap008.suggestedSteps).toBeInstanceOf(Array);
    expect(ap008.suggestedSteps!.length).toBeGreaterThan(0);

    // Structured recommendation model
    expect(ap008.structuredRecommendation).toBeDefined();
    expect(ap008.structuredRecommendation?.why).toBeDefined();
    expect(ap008.structuredRecommendation?.why.length).toBeGreaterThan(10);
    expect(ap008.structuredRecommendation?.howToFix).toBeDefined();
    expect(ap008.structuredRecommendation?.steps).toBeInstanceOf(Array);
  });

  it('3. FindingStore: Single Source of Truth, Deduplication, and Stable Fingerprints', () => {
    const store = new FindingStore();
    const filePath = '/workspace/src/service.ts';

    const testFinding1: Finding = {
      ruleId: 'AP-008',
      message: 'Exception is swallowed',
      severity: 'warning',
      category: 'Code Quality',
      location: {
        filePath,
        start: { line: 10, column: 5 },
        end: { line: 12, column: 6 },
      },
      confidence: 0.9,
      problemTitle: 'Error is caught but not handled',
      whatIsWrong: 'Empty catch block',
      whyItMatters: 'Silent failure',
      howToFix: 'Add logging or rethrow',
    };

    const fingerprint1 = computeFindingFingerprint(testFinding1);
    expect(fingerprint1).toBeDefined();

    // Adding findings
    const changeEvent = store.setFindingsForFile(filePath, [testFinding1]);
    expect(changeEvent.added.length).toBe(1);
    expect(changeEvent.currentTotal).toBe(1);

    // Re-analyzing unchanged file preserves identity
    const unchangedEvent = store.setFindingsForFile(filePath, [{ ...testFinding1 }]);
    expect(unchangedEvent.added.length).toBe(0);
    expect(unchangedEvent.resolved.length).toBe(0);
    expect(unchangedEvent.unchanged.length).toBe(1);

    // Grouping by issue title: groups by problemTitle with location count
    const groups = store.getGroupedIssues();
    expect(groups.length).toBe(1);
    expect(groups[0].title).toBe('Error is caught but not handled');
    expect(groups[0].count).toBe(1);
    expect(groups[0].ruleId).toBe('AP-008');

    // Structural fingerprint matches moved code
    const movedFinding: Finding = {
      ...testFinding1,
      location: {
        filePath,
        start: { line: 25, column: 5 },
        end: { line: 27, column: 6 },
      },
    };
    expect(computeStructuralFingerprint(testFinding1)).toBe(computeStructuralFingerprint(movedFinding));
  });

  it('4. Real-time Workflow: clean -> introduce issue -> fix issue -> update store', () => {
    const store = new FindingStore();
    const filePath = '/workspace/src/components/SettingsPanel.tsx';

    // Step 1: Clean file -> 0 findings
    const cleanCode = `
export function SettingsPanel() {
  return <div>Clean component</div>;
}
`;
    let res = engine.analyze({
      filePath,
      sourceText: cleanCode,
      config: DEFAULT_CONFIG,
      projectContext,
    });
    store.setFindingsForFile(filePath, res.findings);
    expect(store.getAllFindings().length).toBe(0);

    // Step 2: Introduce known violation (silent catch)
    const codeWithIssue = `
export function SettingsPanel() {
  const save = () => {
    try {
      window.localStorage.setItem('k', 'v');
    } catch (e) {}
  };
  return <button onClick={save}>Save</button>;
}
`;
    res = engine.analyze({
      filePath,
      sourceText: codeWithIssue,
      config: DEFAULT_CONFIG,
      projectContext,
    });
    const addEvent = store.setFindingsForFile(filePath, res.findings);
    expect(addEvent.added.length).toBe(1);
    expect(store.getAllFindings().length).toBe(1);
    expect(store.getAllFindings()[0].ruleId).toBe('AP-008');

    // Step 3: Fix the issue (properly handle or report error)
    const fixedCode = `
export function SettingsPanel() {
  const save = () => {
    try {
      window.localStorage.setItem('k', 'v');
    } catch (e) {
      console.error('Failed to save settings:', e);
      throw e;
    }
  };
  return <button onClick={save}>Save</button>;
}
`;
    res = engine.analyze({
      filePath,
      sourceText: fixedCode,
      config: DEFAULT_CONFIG,
      projectContext,
    });
    const fixEvent = store.setFindingsForFile(filePath, res.findings);
    expect(fixEvent.resolved?.length).toBe(1);
    expect(store.getAllFindings().length).toBe(0);
  });

  it('5. Health score calculation matches exact requirement: 14/15 passed with 16 warnings -> 72/100', () => {
    // Requirement 2: 72 / 100, Needs Attention, 16 issues (0 errors, 16 warnings)
    const health = calculateHealthScore({
      passedChecks: 14,
      totalChecks: 15,
      errors: 0,
      warnings: 16,
      suggestions: 0,
      totalFindings: 16,
    });

    expect(health.score).toBe(72);
    expect(health.status).toBe('Needs Attention');
    expect(health.explanation).toContain('72 / 100');
    expect(health.explanation).toContain('16 warnings');
    expect(health.explanation).toContain('14 / 15 checks passed');
  });

  it('6. Human-Friendly Checklist wording and Not Applicable distinction', () => {
    const findings: Finding[] = [];
    const checklist = generateMasterChecklist(projectContext, findings, 'moderate');

    // Human language checks
    const titles = checklist.items.map(item => item.title);
    expect(titles).toContain('Errors are handled clearly');
    expect(titles).toContain('Interactive elements are accessible');
    expect(titles).toContain('Layout works without fragile CSS hacks');

    // Passing checks with no violations are marked 'passed', not 'not-applicable'
    const errorHandlingCheck = checklist.items.find(i => i.id === 'cq-exceptions')!;
    expect(errorHandlingCheck.status).toBe('passed');
    expect(errorHandlingCheck.statusLabel).toBe('Passed');

    // Markdown rendering: separated checklist status and human-friendly groupings
    const md = formatChecklistMarkdown(checklist, findings);
    expect(md).toContain('## Checklist Status');
    expect(md).toContain('## Findings');
    expect(md).not.toContain('NOT APPLICABLE');
  });
});
