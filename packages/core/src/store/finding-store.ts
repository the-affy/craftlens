import {
  Finding,
  computeFindingFingerprint,
  computeStructuralFingerprint,
  ensureFindingCanonical,
  normalizeCategory,
  normalizeSeverity,
  FindingCategory,
  FindingSeverity,
  AuditState,
  SkillVersion,
  issueToFinding,
  findingToIssue,
} from '../types/index.js';
import { Severity } from '../types/severity.js';
import { SidebarFinding } from '../types/sidebar-finding.js';
import { clusterFindingsToSidebarFindings } from '../analyzer/finding-clusterer.js';
import { IssueRegistry, IssueRegistryChangeEvent } from '../issue-registry/issue-registry.js';
import { ScanScope } from '../issue-registry/reconciliation.js';
import { FixCapability, resolveFixCapability } from '../types/fix.js';

export interface FindingStoreChangeEvent {
  filePath?: string;
  totalFindings: number;
  added: Finding[];
  removed: Finding[];
  unchanged: Finding[];
  moved: Finding[];
  /** Alias for removed */
  resolved?: Finding[];
  /** Alias for totalFindings */
  currentTotal?: number;
}

export interface IssueGroup {
  id: string;
  ruleId: string;
  title: string;
  summary: string;
  category: string;
  severity: Severity;
  findings: Finding[];
  locationCount: number;
  count: number;
  whyItMatters: string;
  howToFix: string;
  steps?: string[];
}

export interface FindingFilterOptions {
  severity?: 'all' | 'error' | 'warning' | 'suggestion';
  category?: 'all' | string;
  searchText?: string;
}

export class FindingStore {
  private issueRegistry: IssueRegistry;
  private findingsByFile = new Map<string, Finding[]>();
  private listeners: ((event: FindingStoreChangeEvent) => void)[] = [];
  private selectedIssueId: string | null = null;
  private selectionListeners: ((issueId: string | null) => void)[] = [];
  private fixCapabilityCache = new Map<string, FixCapability>();

  constructor(issueRegistry?: IssueRegistry) {
    this.issueRegistry = issueRegistry || new IssueRegistry();
    this.syncFromRegistry();

    this.issueRegistry.onDidChange((e) => {
      this.syncFromRegistry();
    });
  }

  public getIssueRegistry(): IssueRegistry {
    return this.issueRegistry;
  }

  private syncFromRegistry(): void {
    const byFile = new Map<string, Finding[]>();
    for (const issue of this.issueRegistry.getAllIssues()) {
      if (issue.status === 'resolved' || issue.status === 'ignored') {
        continue;
      }
      const f = issueToFinding(issue);
      const fp = f.filePath || f.location?.filePath || 'unknown';
      let list = byFile.get(fp);
      if (!list) {
        list = [];
        byFile.set(fp, list);
      }
      list.push(f);
    }
    this.findingsByFile = byFile;
  }

  /**
   * Sets findings for a specific file, performing deduplication and reconciliation via IssueRegistry.
   */
  public setFindingsForFile(filePath: string, newFindings: Finding[]): FindingStoreChangeEvent {
    const scope: ScanScope = { type: 'file', filePath };
    const result = this.issueRegistry.reconcile(scope, newFindings);
    this.syncFromRegistry();

    const added = result.added.map(issueToFinding);
    const removed = result.resolved.map(issueToFinding);
    const unchanged = result.unmodified.map(issueToFinding);
    const moved = result.updated.map(issueToFinding);

    const totalCount = this.getTotalCount();
    const event: FindingStoreChangeEvent = {
      filePath,
      totalFindings: totalCount,
      currentTotal: totalCount,
      added,
      removed,
      resolved: removed,
      unchanged,
      moved,
    };

    this.emitChange(event);
    return event;
  }

  public getFindingsForFile(filePath: string): Finding[] {
    return this.findingsByFile.get(filePath) || [];
  }

  public getAllFindings(): Finding[] {
    const all: Finding[] = [];
    for (const list of this.findingsByFile.values()) {
      all.push(...list);
    }
    return all;
  }

  public getFindingsMap(): Map<string, Finding[]> {
    return new Map(this.findingsByFile);
  }

  public hasFinding(findingOrFingerprint: Finding | string): boolean {
    if (!findingOrFingerprint) return false;
    const targetFingerprint = typeof findingOrFingerprint === 'string'
      ? findingOrFingerprint
      : (findingOrFingerprint.fingerprint || (findingOrFingerprint.location ? computeFindingFingerprint(findingOrFingerprint) : undefined));
    if (!targetFingerprint) return false;
    const issue = this.issueRegistry.getIssueByFingerprint(targetFingerprint) || this.issueRegistry.getIssue(targetFingerprint);
    if (issue && issue.status !== 'resolved' && issue.status !== 'ignored') {
      return true;
    }
    for (const list of this.findingsByFile.values()) {
      const match = list.some(f => (f.fingerprint || computeFindingFingerprint(f)) === targetFingerprint || f.id === targetFingerprint);
      if (match) return true;
    }
    return false;
  }

  public getFindingById(idOrFingerprint: string): Finding | undefined {
    if (!idOrFingerprint) return undefined;
    const issue = this.issueRegistry.getIssue(idOrFingerprint) || this.issueRegistry.getIssueByFingerprint(idOrFingerprint);
    if (issue && issue.status !== 'resolved' && issue.status !== 'ignored') {
      return issueToFinding(issue);
    }
    for (const list of this.findingsByFile.values()) {
      const match = list.find(f => (f.fingerprint || computeFindingFingerprint(f)) === idOrFingerprint || f.id === idOrFingerprint);
      if (match) return match;
    }
    return undefined;
  }

  public removeFinding(id: string): void {
    const issue = this.issueRegistry.getIssue(id) || this.issueRegistry.getIssueByFingerprint(id);
    if (issue) {
      this.issueRegistry.updateIssue(issue.id, { status: 'resolved' });
      this.syncFromRegistry();
      const removedFinding = issueToFinding(issue);
      this.emitChange({
        filePath: issue.location?.filePath || '',
        totalFindings: this.getTotalCount(),
        currentTotal: this.getTotalCount(),
        added: [],
        removed: [removedFinding],
        resolved: [removedFinding],
        unchanged: [],
        moved: [],
      });
      return;
    }
    for (const [filePath, list] of this.findingsByFile.entries()) {
      const idx = list.findIndex(f => f.id === id || f.fingerprint === id);
      if (idx !== -1) {
        const [removedFinding] = list.splice(idx, 1);
        this.emitChange({
          filePath,
          totalFindings: this.getTotalCount(),
          currentTotal: this.getTotalCount(),
          added: [],
          removed: [removedFinding],
          resolved: [removedFinding],
          unchanged: [],
          moved: [],
        });
        return;
      }
    }
  }

  public clearFile(filePath: string): void {
    const removed = this.findingsByFile.get(filePath) || [];
    this.findingsByFile.delete(filePath);
    // Mark issues in file as resolved or re-reconcile empty
    this.issueRegistry.reconcile({ type: 'file', filePath }, []);
    this.syncFromRegistry();

    this.emitChange({
      filePath,
      totalFindings: this.getTotalCount(),
      added: [],
      removed,
      unchanged: [],
      moved: [],
    });
  }

  public clearAll(): void {
    this.findingsByFile.clear();
    this.issueRegistry.clear();
    this.emitChange({
      totalFindings: 0,
      added: [],
      removed: [],
      unchanged: [],
      moved: [],
    });
  }

  public getTotalCount(): number {
    let count = 0;
    for (const list of this.findingsByFile.values()) {
      count += list.length;
    }
    return count;
  }

  public getCountsBySeverity(): { errors: number; warnings: number; suggestions: number } {
    let errors = 0;
    let warnings = 0;
    let suggestions = 0;

    for (const list of this.findingsByFile.values()) {
      for (const f of list) {
        if (f.severity === 'blocker' || f.severity === 'error') {
          errors++;
        } else if (f.severity === 'warning') {
          warnings++;
        } else {
          suggestions++;
        }
      }
    }

    return { errors, warnings, suggestions };
  }

  public getCountsByCategory(): Record<string, number> {
    const counts: Record<string, number> = {
      'Code Quality': 0,
      'Architecture': 0,
      'React & State': 0,
      'Accessibility': 0,
      'UX & Functionality': 0,
      'Visual Design': 0,
      'Project Consistency': 0,
      'Security': 0,
    };

    for (const list of this.findingsByFile.values()) {
      for (const f of list) {
        const cat = this.mapRuleToCategory(f.ruleId);
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }

    return counts;
  }

  public mapRuleToCategory(ruleId: string): string {
    const prefix = ruleId.split('-')[0].toUpperCase();
    switch (prefix) {
      case 'AP':
      case 'CD':
        return 'Code Quality';
      case 'RE':
        return 'React & State';
      case 'FN':
        return 'UX & Functionality';
      case 'AX':
        return 'Accessibility';
      case 'CSS':
      case 'VH':
      case 'CP':
      case 'ID':
      case 'AS':
        return 'Visual Design';
      case 'CX':
        return 'Project Consistency';
      case 'SEC':
        return 'Security';
      default:
        return 'Code Quality';
    }
  }

  /**
   * Groups findings into human-friendly issue clusters (e.g. "Error handling: 16 locations")
   */
  public getGroupedIssues(filter?: FindingFilterOptions): IssueGroup[] {
    const groupsMap = new Map<string, IssueGroup>();

    for (const list of this.findingsByFile.values()) {
      for (const f of list) {
        // Apply severity filter
        if (filter?.severity && filter.severity !== 'all') {
          const isErr = f.severity === 'blocker' || f.severity === 'error';
          const isWarn = f.severity === 'warning';
          const isSugg = f.severity === 'suggestion' || f.severity === 'info';

          if (filter.severity === 'error' && !isErr) continue;
          if (filter.severity === 'warning' && !isWarn) continue;
          if (filter.severity === 'suggestion' && !isSugg) continue;
        }

        const category = this.mapRuleToCategory(f.ruleId);
        // Apply category filter
        if (filter?.category && filter.category !== 'all') {
          if (category.toLowerCase() !== filter.category.toLowerCase()) {
            continue;
          }
        }

        // Apply text filter
        if (filter?.searchText) {
          const s = filter.searchText.toLowerCase();
          const matches =
            f.ruleId.toLowerCase().includes(s) ||
            f.message.toLowerCase().includes(s) ||
            (f.whatIsWrong && f.whatIsWrong.toLowerCase().includes(s)) ||
            (f.problemTitle && f.problemTitle.toLowerCase().includes(s)) ||
            (f.location?.filePath && f.location.filePath.toLowerCase().includes(s));
          if (!matches) continue;
        }

        const groupKey = f.ruleId;
        let group = groupsMap.get(groupKey);

        if (!group) {
          const title = f.problemTitle || f.message;
          const summary = f.whatIsWrong || f.message;
          const whyItMatters = f.whyItMatters || f.structuredRecommendation?.why || f.description || '';
          const howToFix = f.howToFix || f.structuredRecommendation?.howToFix || f.recommendation || 'Fix the issue directly.';
          const steps = f.suggestedSteps || f.structuredRecommendation?.steps;

          const newGroup: IssueGroup = {
            id: groupKey,
            ruleId: f.ruleId,
            title,
            summary,
            category,
            severity: f.severity,
            findings: [],
            locationCount: 0,
            count: 0,
            whyItMatters,
            howToFix,
            steps,
          };
          group = newGroup;
          groupsMap.set(groupKey, newGroup);
        }

        group.findings.push(f);
        group.locationCount = group.findings.length;
        group.count = group.findings.length;
      }
    }

    return Array.from(groupsMap.values()).sort((a, b) => {
      const sevWeight = (s: Severity) => (s === 'blocker' || s === 'error' ? 3 : s === 'warning' ? 2 : 1);
      const diff = sevWeight(b.severity) - sevWeight(a.severity);
      if (diff !== 0) return diff;
      return b.locationCount - a.locationCount;
    });
  }

  /**
   * Returns prioritized, clustered sidebar findings.
   */
  public getSidebarFindings(category?: FindingCategory): SidebarFinding[] {
    const all = this.getAllFindings();
    const clustered = clusterFindingsToSidebarFindings(all);
    if (!category) return clustered;
    return clustered.filter(f => f.category === category);
  }

  /**
   * Returns findings segregated into the 3 primary boxes: UI / UX, Backend & Tech, Security.
   */
  public getSidebarFindingsByCategory(): {
    ui: SidebarFinding[];
    backend: SidebarFinding[];
    security: SidebarFinding[];
  } {
    const clustered = this.getSidebarFindings();
    return {
      ui: clustered.filter(f => f.category === 'ui'),
      backend: clustered.filter(f => f.category === 'backend'),
      security: clustered.filter(f => f.category === 'security'),
    };
  }

  /**
   * Returns canonical Findings across all files.
   */
  public getCanonicalFindings(): Finding[] {
    return this.getAllFindings().map(ensureFindingCanonical);
  }

  /**
   * Constructs the single canonical AuditState from current findings in memory.
   */
  public getAuditState(engineVersion: string = '2.0.0', skillVersions: SkillVersion[] = []): AuditState {
    return this.issueRegistry.exportAuditState(engineVersion, skillVersions);
  }

  public getCountsByCanonicalSeverity(): Record<FindingSeverity, number> {
    const counts: Record<FindingSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      suggestion: 0,
      error: 0,
      warning: 0,
      moderate: 0,
      info: 0,
    };
    for (const f of this.getAllFindings()) {
      const sev = normalizeSeverity(f.severity);
      counts[sev] = (counts[sev] || 0) + 1;
    }
    return counts;
  }

  public getCountsByCanonicalCategory(): Record<FindingCategory, number> {
    const counts: Record<FindingCategory, number> = {
      'ui-ux': 0,
      'content': 0,
      'accessibility': 0,
      'code': 0,
      'code-quality': 0,
      'security': 0,
      'performance': 0,
    };
    for (const f of this.getAllFindings()) {
      const cat = normalizeCategory(f.category as string, f.ruleId);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }

  public getFindingsByCanonicalCategory(): Record<FindingCategory, Finding[]> {
    const groups: Record<FindingCategory, Finding[]> = {
      'ui-ux': [],
      'content': [],
      'accessibility': [],
      'code': [],
      'code-quality': [],
      'security': [],
      'performance': [],
    };
    for (const f of this.getCanonicalFindings()) {
      const cat = normalizeCategory(f.category as string, f.ruleId);
      groups[cat].push(f);
    }
    return groups;
  }

  public onDidChange(listener: (event: FindingStoreChangeEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  public getSelectedIssueId(): string | null {
    return this.selectedIssueId;
  }

  public setSelectedIssueId(issueId: string | null): void {
    if (this.selectedIssueId === issueId) return;
    this.selectedIssueId = issueId;
    for (const listener of this.selectionListeners) {
      try {
        listener(issueId);
      } catch (err) {
        console.error('Error in FindingStore selection listener:', err);
      }
    }
  }

  public onDidSelectIssue(listener: (issueId: string | null) => void): () => void {
    this.selectionListeners.push(listener);
    return () => {
      const idx = this.selectionListeners.indexOf(listener);
      if (idx !== -1) {
        this.selectionListeners.splice(idx, 1);
      }
    };
  }

  public getFixCapability(findingOrIssue: any, projectContext?: any, skillManager?: any): FixCapability {
    if (!findingOrIssue) {
      return resolveFixCapability(null);
    }
    const issueId = findingOrIssue.id || findingOrIssue.ruleId || findingOrIssue.fingerprint;
    if (issueId && this.fixCapabilityCache.has(issueId)) {
      return this.fixCapabilityCache.get(issueId)!;
    }
    const cap = resolveFixCapability(findingOrIssue, skillManager, projectContext);
    if (issueId) {
      this.fixCapabilityCache.set(issueId, cap);
    }
    return cap;
  }

  public invalidateFixCapabilityCache(issueId?: string): void {
    if (issueId) {
      this.fixCapabilityCache.delete(issueId);
    } else {
      this.fixCapabilityCache.clear();
    }
  }

  private emitChange(event: FindingStoreChangeEvent): void {
    this.invalidateFixCapabilityCache();
    if (this.selectedIssueId && !this.hasFinding(this.selectedIssueId)) {
      this.setSelectedIssueId(null);
    }
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (e) {
        console.error('Error in FindingStore listener:', e);
      }
    }
  }
}
