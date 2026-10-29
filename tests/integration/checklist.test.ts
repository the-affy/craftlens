import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createDefaultProjectContext,
  generateMasterChecklist,
  formatChecklistMarkdown,
  generateChangeReview,
  formatChangeReviewMarkdown,
  AuditStorageManager,
  Finding,
  createLocation,
} from '../../packages/core/src/index.js';

describe('Master Audit Checklist & Change Review', () => {
  const testWorkspace = path.resolve(__dirname, '../fixtures/temp-workspace');

  beforeEach(() => {
    if (!fs.existsSync(testWorkspace)) {
      fs.mkdirSync(testWorkspace, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it('generates a project-specific checklist reflecting active findings', () => {
    const ctx = createDefaultProjectContext('/test-app');
    ctx.framework = 'react';
    ctx.hasTypeScript = true;

    // Simulate an AP-008 finding
    const dummyLoc = createLocation('/test-app/src/utils.ts', 10, 5, 100, 15, 6, 200);
    const findings: Finding[] = [
      {
        ruleId: 'AP-008',
        message: 'Exception swallowed',
        description: 'Empty catch block',
        severity: 'warning',
        confidence: 0.95,
        location: dummyLoc,
        evidence: [],
      },
    ];

    const checklist = generateMasterChecklist(ctx, findings, 'moderate');
    expect(checklist.summary.total).toBeGreaterThan(5);
    expect(checklist.summary.warnings).toBe(1);

    // The exception propagation item should be in 'warning' status
    const exItem = checklist.items.find(i => i.id === 'cq-exceptions');
    expect(exItem).toBeDefined();
    expect(exItem?.status).toBe('warning');

    // Items with no findings should be passed
    const a11yItem = checklist.items.find(i => i.id === 'a11y-interactive-semantics');
    expect(a11yItem?.status).toBe('passed');
  });

  it('updates checklist item from warning to passed when issue is resolved', () => {
    const ctx = createDefaultProjectContext('/test-app');
    ctx.framework = 'react';

    const dummyLoc = createLocation('/test-app/src/utils.ts', 10, 5, 100, 15, 6, 200);
    const initialFindings: Finding[] = [
      {
        ruleId: 'AP-008',
        message: 'Exception swallowed',
        description: 'Empty catch block',
        severity: 'warning',
        confidence: 0.95,
        location: dummyLoc,
        evidence: [],
      },
    ];

    // Initial audit with issue
    const checklistBefore = generateMasterChecklist(ctx, initialFindings, 'moderate');
    expect(checklistBefore.items.find(i => i.id === 'cq-exceptions')?.status).toBe('warning');

    // Developer fixes the issue -> re-audit with 0 findings
    const checklistAfter = generateMasterChecklist(ctx, [], 'moderate', checklistBefore);
    expect(checklistAfter.items.find(i => i.id === 'cq-exceptions')?.status).toBe('passed');
    expect(checklistAfter.summary.warnings).toBe(0);
    expect(checklistAfter.summary.healthScore).toBe(100);
  });

  it('marks items as not-applicable when project does not use the technology', () => {
    const ctx = createDefaultProjectContext('/test-cli');
    ctx.framework = undefined; // No React / frontend framework
    ctx.cssStrategy = undefined;

    const checklist = generateMasterChecklist(ctx, [], 'moderate');
    const effectItem = checklist.items.find(i => i.id === 'state-effects');
    expect(effectItem?.status).toBe('not-applicable');
  });

  it('persists audit.json, checklist.md, issues.md, suggestions.md, and changes.md to disk via AuditStorageManager', () => {
    const storage = new AuditStorageManager(testWorkspace);
    const ctx = createDefaultProjectContext(testWorkspace);

    const { checklist, historyEntry } = storage.syncAudit(ctx, [], 'moderate');

    expect(fs.existsSync(path.join(testWorkspace, '.craftlens/audit.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.craftlens/checklist.md'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.craftlens/issues.md'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.craftlens/suggestions.md'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.craftlens/changes.md'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.craftlens/history.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.craftlens/problems.md'))).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, '.craftlens/suggestion.md'))).toBe(false);

    const savedAudit = storage.loadAudit();
    expect(savedAudit?.projectName).toBe(path.basename(testWorkspace));
    expect(historyEntry.auditNumber).toBe(1);

    const md = fs.readFileSync(path.join(testWorkspace, '.craftlens/checklist.md'), 'utf-8');
    expect(md).toContain('# CraftLens Master Audit');
    expect(md).toContain('PASSED');

    const issuesMd = fs.readFileSync(path.join(testWorkspace, '.craftlens/issues.md'), 'utf-8');
    expect(issuesMd).toContain('# CraftLens Issues');

    const suggestionsMd = fs.readFileSync(path.join(testWorkspace, '.craftlens/suggestions.md'), 'utf-8');
    expect(suggestionsMd).toContain('# CraftLens Suggestions');

    const changesMd = fs.readFileSync(path.join(testWorkspace, '.craftlens/changes.md'), 'utf-8');
    expect(changesMd).toContain('# CraftLens Changes');
  });

  it('records user changes and updates changes.md sequentially over time', () => {
    const storage = new AuditStorageManager(testWorkspace);

    storage.appendUserChange({
      id: 'chg_1',
      timestamp: Date.now() - 5000,
      filesChanged: ['src/App.tsx'],
      linesAdded: 10,
      linesRemoved: 2,
      resolvedFindings: [{ ruleId: 'AP-008', message: 'Swallowed error' }],
      newFindings: [],
      source: 'editor-save',
    });

    storage.appendUserChange({
      id: 'chg_2',
      timestamp: Date.now(),
      filesChanged: ['src/Button.tsx'],
      linesAdded: 3,
      linesRemoved: 1,
      resolvedFindings: [{ ruleId: 'UI-006', message: 'Button margin' }],
      newFindings: [],
      source: 'quick-fix',
    });

    const changes = storage.loadUserChanges();
    expect(changes.length).toBe(2);
    expect(changes[0].filesChanged).toContain('src/App.tsx');
    expect(changes[1].filesChanged).toContain('src/Button.tsx');

    const md = fs.readFileSync(path.join(testWorkspace, '.craftlens/changes.md'), 'utf-8');
    expect(md).toContain('**Total Changes Recorded:** 2');
    expect(md).toContain('src/App.tsx');
    expect(md).toContain('src/Button.tsx');
    expect(md).toContain('AP-008');
    expect(md).toContain('UI-006');
  });

  it('generates a concise change review distinguishing new vs resolved findings', () => {
    const loc1 = createLocation('/src/App.tsx', 5, 1, 50, 5, 20, 70);
    const loc2 = createLocation('/src/App.tsx', 20, 1, 200, 20, 20, 220);

    const prevFindings: Finding[] = [
      {
        ruleId: 'AP-008',
        message: 'Old exception issue',
        description: 'Swallowed error',
        severity: 'warning',
        confidence: 0.95,
        location: loc1,
        fingerprint: 'AP-008_hash1',
        evidence: [],
      },
    ];

    const currFindings: Finding[] = [
      {
        ruleId: 'FN-015',
        message: 'New clickable div',
        description: 'Missing role="button"',
        severity: 'warning',
        confidence: 0.95,
        location: loc2,
        fingerprint: 'FN-015_hash2',
        evidence: [],
      },
    ];

    const review = generateChangeReview(['src/App.tsx'], prevFindings, currFindings, 25, 5);

    expect(review.newFindings.length).toBe(1);
    expect(review.newFindings[0].ruleId).toBe('FN-015');
    expect(review.resolvedFindings.length).toBe(1);
    expect(review.resolvedFindings[0].ruleId).toBe('AP-008');

    const formatted = formatChangeReviewMarkdown(review);
    expect(formatted).toContain('CraftLens · Change Review');
    expect(formatted).toContain('1 issue(s) resolved');
    expect(formatted).toContain('FN-015: New clickable div');
  });

  describe('Checklist Criterion Data Model & UX Interactions', () => {
    it('Requirement 1 & 5: uses stable identifiers and derives dynamic count from criteria', () => {
      const ctx = createDefaultProjectContext('/test-app');
      const checklist = generateMasterChecklist(ctx, [], 'moderate');

      expect(checklist.items.length).toBeGreaterThan(0);
      expect(checklist.summary.total).toBe(checklist.items.filter(i => i.status !== 'not-applicable').length);

      for (const item of checklist.items) {
        expect(typeof item.id).toBe('string');
        expect(item.id.length).toBeGreaterThan(0);
        expect(typeof item.title).toBe('string');
        expect(typeof item.checked).toBe('boolean');
        expect(Array.isArray(item.relatedRuleIds)).toBe(true);
      }
    });

    it('Requirement 2 & 4: supports manual checkbox toggle and persists state across syncs', () => {
      const storage = new AuditStorageManager(testWorkspace);
      const ctx = createDefaultProjectContext(testWorkspace);

      // Initial audit
      const audit = storage.getOrInitAudit(ctx, []);
      expect(audit.items.length).toBeGreaterThan(0);

      const targetItem = audit.items[0];
      const initialChecked = targetItem.checked;

      // User manually toggles checkbox
      const updatedAudit = storage.updateCriterionChecked(targetItem.id, !initialChecked);
      expect(updatedAudit).not.toBeNull();
      const updatedItem = updatedAudit!.items.find(i => i.id === targetItem.id);
      expect(updatedItem?.checked).toBe(!initialChecked);
      expect(updatedItem?.manualOverride).toBe(true);

      // Re-syncing audit preserves the user's manual override
      const resynced = storage.syncAudit(ctx, [], 'moderate');
      const resyncedItem = resynced.checklist.items.find(i => i.id === targetItem.id);
      expect(resyncedItem?.checked).toBe(!initialChecked);
      expect(resyncedItem?.manualOverride).toBe(true);

      // User manually unchecks again
      const uncheckedAudit = storage.updateCriterionChecked(targetItem.id, initialChecked);
      const uncheckedItem = uncheckedAudit!.items.find(i => i.id === targetItem.id);
      expect(uncheckedItem?.checked).toBe(initialChecked);
    });

    it('Requirement 3 & 6: automatically marks criterion checked on successful fix of matching rule', () => {
      const storage = new AuditStorageManager(testWorkspace);
      const ctx = createDefaultProjectContext(testWorkspace);

      const dummyLoc = createLocation('/test-app/src/utils.ts', 10, 5, 100, 15, 6, 200);
      const findingWithRule: Finding = {
        ruleId: 'UI-SPACING-01',
        message: 'Inconsistent spacing detected',
        severity: 'warning',
        location: dummyLoc,
        evidence: [],
      };

      const auditBefore = storage.syncAudit(ctx, [findingWithRule], 'moderate');
      const spacingCriterion = auditBefore.checklist.items.find(i =>
        i.relatedRuleIds?.includes('UI-SPACING-01') || i.id === 'arch-design-tokens'
      );
      expect(spacingCriterion).toBeDefined();

      // Ensure an unrelated criterion is unchecked
      storage.updateCriterionChecked('cq-exceptions', false);

      // Successful fix occurs for UI-SPACING-01
      const modifiedAudit = storage.markCriteriaCheckedForFinding(findingWithRule);
      expect(modifiedAudit).not.toBeNull();

      const checkedCriterion = modifiedAudit!.items.find(i => i.id === spacingCriterion!.id);
      expect(checkedCriterion?.checked).toBe(true);

      // Unrelated criterion remains unchecked
      const unrelatedCriterion = modifiedAudit!.items.find(i => i.id === 'cq-exceptions');
      expect(unrelatedCriterion?.checked).toBe(false);
    });

    it('Requirement 3: does NOT check criterion if fix is previewed or rejected', () => {
      const storage = new AuditStorageManager(testWorkspace);
      const ctx = createDefaultProjectContext(testWorkspace);

      const dummyLoc = createLocation('/test-app/src/utils.ts', 10, 5, 100, 15, 6, 200);
      const finding: Finding = {
        ruleId: 'UI-SPACING-01',
        message: 'Inconsistent spacing detected',
        severity: 'warning',
        location: dummyLoc,
        evidence: [],
      };

      storage.syncAudit(ctx, [finding], 'moderate');

      // Mere preview or rejection does NOT invoke markCriteriaCheckedForFinding
      const currentAudit = storage.loadAudit();
      const target = currentAudit?.items.find(i => i.relatedRuleIds?.includes('UI-SPACING-01'));
      expect(target?.checked).toBe(false);
    });

    it('Requirement 2 & 7: formatChecklistMarkdown formats checked as [x] and unchecked as [ ]', () => {
      const ctx = createDefaultProjectContext('/test-app');
      const checklist = generateMasterChecklist(ctx, [], 'moderate');

      const applicableItems = checklist.items.filter(i => i.status !== 'not-applicable');
      applicableItems[0].status = 'passed';
      applicableItems[0].checked = true;
      applicableItems[1].status = 'warning';
      applicableItems[1].checked = false;

      const md = formatChecklistMarkdown(checklist);
      expect(md).toContain(`- [x] **${applicableItems[0].title}**`);
      expect(md).toContain(`- [ ] **${applicableItems[1].title}**`);
    });
  });
});
