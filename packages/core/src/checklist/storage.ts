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

  constructor(workspaceRoot: string) {
    this.baseDir = path.join(workspaceRoot, '.antislop');
  }

  public getDirectory(): string {
    return this.baseDir;
  }

  public ensureDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public loadAudit(): MasterChecklist | null {
    try {
      const filePath = path.join(this.baseDir, 'audit.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as MasterChecklist;
      }
    } catch (e) {
      console.warn('Failed to read audit.json:', e);
    }
    return null;
  }

  public saveAudit(checklist: MasterChecklist): void {
    try {
      this.ensureDir();
      fs.writeFileSync(
        path.join(this.baseDir, 'audit.json'),
        JSON.stringify(checklist, null, 2),
        'utf-8'
      );
    } catch (e) {
      console.error('Failed to write audit.json:', e);
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
}
