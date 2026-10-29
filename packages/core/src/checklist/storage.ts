import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuditLevel } from '../types/audit-level.js';
import { Finding } from '../types/finding.js';
import { ProjectContext } from '../types/context.js';
import { Issue } from '../types/issue.js';
import type { ChangeManager } from '../changes/index.js';
import {
  AuditHistoryEntry,
  MasterChecklist,
  UserChangeRecord,
} from '../types/checklist.js';
import {
  formatChecklistMarkdown,
  generateMasterChecklist,
  formatIssuesMarkdown,
  formatSuggestionsMarkdown,
  formatUserChangesMarkdown,
  formatProblemsMarkdown,
  formatSuggestionMarkdown,
} from './generator.js';

export class AuditStorageManager {
  private baseDir: string;
  private workspaceRoot: string;
  private inMemoryAudit: MasterChecklist | null = null;
  private inMemoryHistory: AuditHistoryEntry[] | null = null;
  private inMemoryChanges: UserChangeRecord[] | null = null;
  private lastWrittenContent = new Map<string, string>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.baseDir = path.join(workspaceRoot, '.craftlens');
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public getDirectory(): string {
    return this.baseDir;
  }

  public ensureDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.baseDir, { recursive: true });
      } catch {
        // In virtual or test environments where directory creation might fail
      }
    }
  }

  public loadProjectConfig(): Record<string, any> | null {
    try {
      const filePath = path.join(this.baseDir, 'config.json');
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (e) {
      console.warn('Failed to read .craftlens/config.json:', e);
    }
    return null;
  }

  public ensureDefaultProjectConfig(): void {
    try {
      this.ensureDir();
      const filePath = path.join(this.baseDir, 'config.json');
      if (!fs.existsSync(filePath)) {
        const defaultConfig = {
          autoAudit: true,
          defaultAuditLevel: 'moderate',
        };
        fs.writeFileSync(filePath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      }
    } catch (e) {
      // In virtual or test environments
    }
  }

  public loadSkillsConfig(): Record<string, any> {
    try {
      const filePath = path.join(this.baseDir, 'skills.json');
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return raw.skills || raw || {};
      }
    } catch (e) {
      console.warn('Failed to read .craftlens/skills.json:', e);
    }
    return {};
  }

  public saveSkillsConfig(skills: Record<string, any>): void {
    try {
      this.ensureDir();
      const filePath = path.join(this.baseDir, 'skills.json');
      fs.writeFileSync(
        filePath,
        JSON.stringify({ skills, updatedAt: new Date().toISOString() }, null, 2),
        'utf-8'
      );
    } catch (e) {
      // In virtual environments
    }
  }

  public loadSuppressions(): string[] {
    try {
      const filePath = path.join(this.baseDir, 'suppressions.json');
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Array.isArray(raw.suppressions) ? raw.suppressions : [];
      }
    } catch (e) {
      console.warn('Failed to read .craftlens/suppressions.json:', e);
    }
    return [];
  }

  public addSuppression(ruleId: string): void {
    try {
      this.ensureDir();
      const suppressions = this.loadSuppressions();
      if (!suppressions.includes(ruleId)) {
        suppressions.push(ruleId);
        fs.writeFileSync(
          path.join(this.baseDir, 'suppressions.json'),
          JSON.stringify({ suppressions }, null, 2),
          'utf-8'
        );
      }
    } catch (e) {
      // In virtual environments
    }
  }

  public loadAudit(): MasterChecklist | null {
    if (this.inMemoryAudit) return this.inMemoryAudit;
    try {
      const filePath = path.join(this.baseDir, 'audit.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as MasterChecklist;
        this.inMemoryAudit = parsed;
        return parsed;
      }
    } catch (e) {
      // Failed to read audit.json
    }
    return this.inMemoryAudit;
  }

  public saveAudit(checklist: MasterChecklist): void {
    this.inMemoryAudit = checklist;
    const jsonStr = JSON.stringify(checklist, null, 2);
    if (this.lastWrittenContent.get('audit.json') === jsonStr) {
      return;
    }
    this.lastWrittenContent.set('audit.json', jsonStr);
    try {
      this.ensureDir();
      fs.writeFileSync(path.join(this.baseDir, 'audit.json'), jsonStr, 'utf-8');
    } catch (e) {
      // In virtual or test environments where directory creation might fail, in-memory state is preserved
    }
  }

  public loadHistory(): AuditHistoryEntry[] {
    if (this.inMemoryHistory) return this.inMemoryHistory;
    try {
      const filePath = path.join(this.baseDir, 'history.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as AuditHistoryEntry[];
        this.inMemoryHistory = parsed;
        return parsed;
      }
    } catch (e) {
      // Failed to read history.json
    }
    return [];
  }

  public appendHistory(entry: AuditHistoryEntry): void {
    try {
      const history = [...this.loadHistory()];
      history.push(entry);
      // Keep last 100 audits
      if (history.length > 100) {
        history.shift();
      }
      this.inMemoryHistory = history;
      const jsonStr = JSON.stringify(history, null, 2);
      if (this.lastWrittenContent.get('history.json') !== jsonStr) {
        this.lastWrittenContent.set('history.json', jsonStr);
        this.ensureDir();
        fs.writeFileSync(path.join(this.baseDir, 'history.json'), jsonStr, 'utf-8');
      }
    } catch (e) {
      // ignore
    }
  }

  public removeObsoleteFile(filename: string): void {
    try {
      const p = path.join(this.baseDir, filename);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
      if (this.workspaceRoot && this.workspaceRoot !== '/' && !this.workspaceRoot.endsWith('.craftlens')) {
        const rootP = path.join(this.workspaceRoot, filename);
        if (fs.existsSync(rootP)) {
          fs.unlinkSync(rootP);
        }
      }
    } catch {
      // ignore
    }
  }

  private writeFileSafe(filename: string, content: string, mirrorToRoot = false): void {
    if (this.lastWrittenContent.get(filename) === content) {
      return;
    }
    this.lastWrittenContent.set(filename, content);
    try {
      this.ensureDir();
      fs.writeFileSync(path.join(this.baseDir, filename), content, 'utf-8');
      if (mirrorToRoot && this.workspaceRoot && this.workspaceRoot !== '/' && !this.workspaceRoot.endsWith('.craftlens')) {
        try {
          fs.writeFileSync(path.join(this.workspaceRoot, filename), content, 'utf-8');
        } catch {
          // ignore root mirror error in virtual/test setups
        }
      }
    } catch (e) {
      // ignore write error in virtual/restricted environments
    }
  }

  public saveChecklistMarkdown(markdown: string): void {
    this.writeFileSafe('checklist.md', markdown);
  }

  public saveIssuesMarkdown(markdown: string): void {
    this.writeFileSafe('issues.md', markdown);
    this.removeObsoleteFile('problems.md');
  }

  public saveProblemsMarkdown(markdown: string): void {
    this.saveIssuesMarkdown(markdown);
  }

  public saveSuggestionsMarkdown(markdown: string): void {
    this.writeFileSafe('suggestions.md', markdown);
    this.removeObsoleteFile('suggestion.md');
    this.removeObsoleteFile('solutions.md');
  }

  public saveSuggestionMarkdown(markdown: string): void {
    this.saveSuggestionsMarkdown(markdown);
  }

  public saveSolutionsMarkdown(markdown: string): void {
    this.saveSuggestionsMarkdown(markdown);
  }

  public saveChangesMarkdown(markdown: string): void {
    this.writeFileSafe('changes.md', markdown);
  }

  public saveChangeReview(markdown: string): void {
    this.writeFileSafe('change-review.md', markdown);
  }

  public loadUserChanges(): UserChangeRecord[] {
    if (this.inMemoryChanges) return this.inMemoryChanges;
    try {
      const filePath = path.join(this.baseDir, 'changes.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const res = Array.isArray(parsed) ? parsed : [];
        this.inMemoryChanges = res;
        return res;
      }
    } catch (e) {
      // Failed to read changes.json
    }
    return [];
  }

  public appendUserChange(change: UserChangeRecord, projectName?: string, changeManager?: ChangeManager): void {
    try {
      const changes = [...this.loadUserChanges()];
      const existingIdx = changes.findIndex(c => c.id === change.id);
      if (existingIdx !== -1) {
        changes[existingIdx] = {
          ...changes[existingIdx],
          ...change,
        };
      } else {
        // Debounce duplicate recordings for identical files within 1.5 seconds
        const last = changes[changes.length - 1];
        if (
          last &&
          Date.now() - last.timestamp < 1500 &&
          JSON.stringify(last.filesChanged) === JSON.stringify(change.filesChanged)
        ) {
          changes[changes.length - 1] = {
            ...last,
            ...change,
            timestamp: last.timestamp,
          };
        } else {
          changes.push(change);
        }
      }

      if (changes.length > 150) {
        changes.shift();
      }

      this.inMemoryChanges = changes;
      const jsonStr = JSON.stringify(changes, null, 2);
      if (this.lastWrittenContent.get('changes.json') !== jsonStr) {
        this.lastWrittenContent.set('changes.json', jsonStr);
        this.ensureDir();
        fs.writeFileSync(path.join(this.baseDir, 'changes.json'), jsonStr, 'utf-8');
      }

      const md = formatUserChangesMarkdown(changes, projectName || 'Project', changeManager);
      this.saveChangesMarkdown(md);
    } catch (e) {
      // ignore
    }
  }

  public ensureDefaultFiles(
    projectContext?: ProjectContext,
    findings: (Finding | Issue)[] = [],
    changeManager?: ChangeManager
  ): void {
    try {
      this.ensureDir();
      const projName = projectContext?.projectName || 'Project';

      // Clean up deprecated legacy file names
      this.removeObsoleteFile('problems.md');
      this.removeObsoleteFile('suggestion.md');
      this.removeObsoleteFile('solutions.md');

      // 1. checklist.md
      const checklistPath = path.join(this.baseDir, 'checklist.md');
      if (!fs.existsSync(checklistPath)) {
        const audit = this.getOrInitAudit(projectContext, findings as Finding[]);
        this.saveChecklistMarkdown(formatChecklistMarkdown(audit));
      }

      // 2. issues.md
      const issuesPath = path.join(this.baseDir, 'issues.md');
      if (!fs.existsSync(issuesPath)) {
        this.saveIssuesMarkdown(formatIssuesMarkdown(findings, projName));
      }

      // 3. suggestions.md
      const suggestionsPath = path.join(this.baseDir, 'suggestions.md');
      if (!fs.existsSync(suggestionsPath)) {
        this.saveSuggestionsMarkdown(formatSuggestionsMarkdown(findings, projName));
      }

      // 4. changes.md
      const changesPath = path.join(this.baseDir, 'changes.md');
      if (!fs.existsSync(changesPath)) {
        const userChanges = this.loadUserChanges();
        this.saveChangesMarkdown(formatUserChangesMarkdown(userChanges, projName, changeManager));
      }
    } catch (e) {
      console.warn('Failed to ensure default CraftLens markdown files:', e);
    }
  }

  public syncAudit(
    projectContext: ProjectContext,
    findings: (Finding | Issue)[] = [],
    auditLevel: AuditLevel = 'moderate',
    changeManager?: ChangeManager
  ): { checklist: MasterChecklist; historyEntry: AuditHistoryEntry } {
    const previousAudit = this.loadAudit();
    const checklist = generateMasterChecklist(projectContext, findings as Finding[], auditLevel, previousAudit || undefined);

    // Save JSON and Markdown
    this.saveAudit(checklist);
    const md = formatChecklistMarkdown(checklist);
    this.saveChecklistMarkdown(md);

    // Clean up obsolete files
    this.removeObsoleteFile('problems.md');
    this.removeObsoleteFile('suggestion.md');
    this.removeObsoleteFile('solutions.md');

    // Save issues.md and suggestions.md
    const projName = projectContext?.projectName || 'Project';
    const issuesMd = formatIssuesMarkdown(findings, projName);
    this.saveIssuesMarkdown(issuesMd);

    const suggestionsMd = formatSuggestionsMarkdown(findings, projName);
    this.saveSuggestionsMarkdown(suggestionsMd);

    // Save changes.md
    const userChanges = this.loadUserChanges();
    const changesMd = formatUserChangesMarkdown(userChanges, projName, changeManager);
    this.saveChangesMarkdown(changesMd);

    // Calculate changes for history entry
    const history = this.loadHistory();
    const auditNumber = history.length + 1;
    const previousTotal = previousAudit
      ? previousAudit.summary.errors + previousAudit.summary.warnings + previousAudit.summary.suggestions
      : 0;
    const currentTotal = checklist.summary.errors + checklist.summary.warnings + checklist.summary.suggestions;

    const historyEntry: AuditHistoryEntry = {
      auditNumber,
      timestamp: Date.now(),
      level: auditLevel,
      totalFindings: currentTotal,
      errors: checklist.summary.errors,
      warnings: checklist.summary.warnings,
      suggestions: checklist.summary.suggestions,
      resolvedSincePrevious: Math.max(0, previousTotal - currentTotal),
      newFindings: Math.max(0, currentTotal - previousTotal),
    };

    this.appendHistory(historyEntry);

    return { checklist, historyEntry };
  }

  public getOrInitAudit(
    projectContext?: ProjectContext,
    findings: Finding[] = [],
    auditLevel: AuditLevel = 'moderate'
  ): MasterChecklist {
    let audit = this.loadAudit();
    if (!audit || !Array.isArray(audit.items) || audit.items.length === 0) {
      const root = path.dirname(this.baseDir);
      const ctx = projectContext || ({
        rootPath: root,
        hasTypeScript: true,
        dependencies: {},
        devDependencies: {},
        baseline: { components: [] },
      } as any);
      const syncResult = this.syncAudit(ctx, findings, auditLevel);
      return syncResult.checklist;
    }
    return audit;
  }

  public updateCriterionChecked(criterionId: string, checked: boolean): MasterChecklist | null {
    let checklist = this.loadAudit();
    if (!checklist) {
      checklist = this.getOrInitAudit();
    }
    if (!checklist || !Array.isArray(checklist.items)) return null;

    const item = checklist.items.find(i => i.id === criterionId);
    if (item) {
      item.checked = checked;
      item.manualOverride = true;
      if (checked) {
        if (item.status === 'failed' || item.status === 'warning') {
          item.status = 'passed';
          item.statusLabel = 'Passed';
        }
      } else {
        if (item.status === 'passed') {
          item.status = 'failed';
          item.statusLabel = 'Failed';
        }
      }

      // Update summary counts
      const applicableItems = checklist.items.filter(i => i.status !== 'not-applicable');
      const passedItems = applicableItems.filter(i => i.checked || i.status === 'passed');
      checklist.summary.passed = passedItems.length;

      this.saveAudit(checklist);
      const md = formatChecklistMarkdown(checklist);
      this.saveChecklistMarkdown(md);
    }
    return checklist;
  }

  public markCriteriaCheckedForFinding(finding: any): MasterChecklist | null {
    if (!finding) return null;
    const ruleId = finding.ruleId;
    if (!ruleId) return null;

    let checklist = this.loadAudit();
    if (!checklist) {
      checklist = this.getOrInitAudit();
    }
    if (!checklist || !Array.isArray(checklist.items)) return null;

    let modified = false;
    for (const item of checklist.items) {
      const rules = item.relatedRuleIds || item.relatedRules || [];
      if (rules.includes(ruleId)) {
        if (typeof item.findingCount === 'number' && item.findingCount > 0) {
          item.findingCount = Math.max(0, item.findingCount - 1);
        } else {
          item.findingCount = 0;
        }

        if (item.findingCount === 0) {
          item.checked = true;
          item.status = 'passed';
          item.statusLabel = 'Passed';
        } else if (!item.manualOverride) {
          item.checked = false;
          item.status = 'failed';
          item.statusLabel = 'Failed';
        }
        modified = true;
      }
    }

    if (modified) {
      // Update summary counts
      const applicableItems = checklist.items.filter(i => i.status !== 'not-applicable');
      const passedItems = applicableItems.filter(i => i.checked || i.status === 'passed');
      checklist.summary.passed = passedItems.length;

      this.saveAudit(checklist);
      const md = formatChecklistMarkdown(checklist);
      this.saveChecklistMarkdown(md);
    }
    return checklist;
  }
}
