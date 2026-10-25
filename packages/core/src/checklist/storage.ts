import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuditLevel } from '../types/audit-level.js';
import { Finding } from '../types/finding.js';
import { ProjectContext } from '../types/context.js';
import {
  AuditHistoryEntry,
  MasterChecklist,
} from '../types/checklist.js';
import {
  formatChecklistMarkdown,
  generateMasterChecklist,
} from './generator.js';

export class AuditStorageManager {
  private baseDir: string;
  private inMemoryAudit: MasterChecklist | null = null;

  constructor(workspaceRoot: string) {
    this.baseDir = path.join(workspaceRoot, '.craftlens');
  }

  public getDirectory(): string {
    return this.baseDir;
  }

  public ensureDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
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
      console.error('Failed to initialize .craftlens/config.json:', e);
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
      console.error('Failed to write .craftlens/skills.json:', e);
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
      console.error('Failed to write .craftlens/suppressions.json:', e);
    }
  }

  public loadAudit(): MasterChecklist | null {
    try {
      const filePath = path.join(this.baseDir, 'audit.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as MasterChecklist;
        this.inMemoryAudit = parsed;
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to read audit.json:', e);
    }
    return this.inMemoryAudit;
  }

  public saveAudit(checklist: MasterChecklist): void {
    this.inMemoryAudit = checklist;
    try {
      this.ensureDir();
      fs.writeFileSync(
        path.join(this.baseDir, 'audit.json'),
        JSON.stringify(checklist, null, 2),
        'utf-8'
      );
    } catch (e) {
      // In virtual or test environments where directory creation might fail, in-memory state is preserved
    }
  }

  public loadHistory(): AuditHistoryEntry[] {
    try {
      const filePath = path.join(this.baseDir, 'history.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as AuditHistoryEntry[];
      }
    } catch (e) {
      console.warn('Failed to read history.json:', e);
    }
    return [];
  }

  public appendHistory(entry: AuditHistoryEntry): void {
    try {
      this.ensureDir();
      const history = this.loadHistory();
      history.push(entry);
      // Keep last 100 audits
      if (history.length > 100) {
        history.shift();
      }
      fs.writeFileSync(
        path.join(this.baseDir, 'history.json'),
        JSON.stringify(history, null, 2),
        'utf-8'
      );
    } catch (e) {
      console.error('Failed to write history.json:', e);
    }
  }

  public saveChecklistMarkdown(markdown: string): void {
    try {
      this.ensureDir();
      fs.writeFileSync(
        path.join(this.baseDir, 'checklist.md'),
        markdown,
        'utf-8'
      );
    } catch (e) {
      console.error('Failed to write checklist.md:', e);
    }
  }

  public saveChangeReview(markdown: string): void {
    try {
      this.ensureDir();
      fs.writeFileSync(
        path.join(this.baseDir, 'change-review.md'),
        markdown,
        'utf-8'
      );
    } catch (e) {
      console.error('Failed to write change-review.md:', e);
    }
  }

  public syncAudit(
    projectContext: ProjectContext,
    findings: Finding[],
    auditLevel: AuditLevel = 'moderate'
  ): { checklist: MasterChecklist; historyEntry: AuditHistoryEntry } {
    const previousAudit = this.loadAudit();
    const checklist = generateMasterChecklist(projectContext, findings, auditLevel, previousAudit || undefined);

    // Save JSON and Markdown
    this.saveAudit(checklist);
    const md = formatChecklistMarkdown(checklist);
    this.saveChecklistMarkdown(md);

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
      const root = this.baseDir.replace(/[\/\\]\.craftlens$/, '');
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
