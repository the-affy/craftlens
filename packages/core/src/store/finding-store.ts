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
} from '../types/index.js';
import { Severity } from '../types/severity.js';
import { SidebarFinding } from '../types/sidebar-finding.js';
import { clusterFindingsToSidebarFindings } from '../analyzer/finding-clusterer.js';

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
  private findingsByFile = new Map<string, Finding[]>();
  private listeners: ((event: FindingStoreChangeEvent) => void)[] = [];

  /**
   * Sets findings for a specific file, performing deduplication and identity tracking.
   */
  public setFindingsForFile(filePath: string, newFindings: Finding[]): FindingStoreChangeEvent {
    const oldFindings = this.findingsByFile.get(filePath) || [];
    const oldByFingerprint = new Map<string, Finding>();
    const oldByStructural = new Map<string, Finding>();

    for (const f of oldFindings) {
      if (f.fingerprint) {
        oldByFingerprint.set(f.fingerprint, f);
      }
      const structKey = computeStructuralFingerprint(f);
      oldByStructural.set(structKey, f);
    }

    const added: Finding[] = [];
    const unchanged: Finding[] = [];
    const moved: Finding[] = [];
    const finalFindings: Finding[] = [];
    const seenFingerprints = new Set<string>();

    for (const raw of newFindings) {
      const rawFinding = ensureFindingCanonical(raw);
      // Ensure fingerprint
      const fingerprint = rawFinding.fingerprint || computeFindingFingerprint(rawFinding);
      rawFinding.fingerprint = fingerprint;

      // Deduplicate if identical finding in same file
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }
      seenFingerprints.add(fingerprint);

      if (oldByFingerprint.has(fingerprint)) {
        // Exact match: unchanged finding, preserve identity
        const existing = oldByFingerprint.get(fingerprint)!;
        unchanged.push(existing);
        finalFindings.push(existing);
      } else {
        const structKey = computeStructuralFingerprint(rawFinding);
        if (oldByStructural.has(structKey)) {
          // Moved finding (line or character shifted)
          moved.push(rawFinding);
        } else {
          // Genuinely new finding
          added.push(rawFinding);
        }
        finalFindings.push(rawFinding);
      }
    }

    // Determine removed findings
    const removed: Finding[] = [];
    for (const f of oldFindings) {
      if (f.fingerprint && !seenFingerprints.has(f.fingerprint)) {
        const structKey = computeStructuralFingerprint(f);
        const wasMoved = moved.some(m => computeStructuralFingerprint(m) === structKey);
        if (!wasMoved) {
          removed.push(f);
        }
      }
    }

    this.findingsByFile.set(filePath, finalFindings);

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
    for (const list of this.findingsByFile.values()) {
      if (list.some(f => (f.fingerprint || computeFindingFingerprint(f)) === targetFingerprint)) {
        return true;
      }
    }
    return false;
  }

  public getFindingById(idOrFingerprint: string): Finding | undefined {
    if (!idOrFingerprint) return undefined;
    for (const list of this.findingsByFile.values()) {
      const match = list.find(f => (f.fingerprint || computeFindingFingerprint(f)) === idOrFingerprint);
      if (match) return match;
    }
    return undefined;
  }

  public clearFile(filePath: string): void {
    const removed = this.findingsByFile.get(filePath) || [];
    this.findingsByFile.delete(filePath);
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
            f.location.filePath.toLowerCase().includes(s);
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
      // Sort errors first, then warnings, then suggestions, then by count descending
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
  public getAuditState(engineVersion: string = '1.0.0', skillVersions: SkillVersion[] = []): AuditState {
    const findings = this.getCanonicalFindings();
    const instances = findings.flatMap(f => f.instances && f.instances.length > 0 ? f.instances : []);
    const counts = this.getCountsByCanonicalSeverity();

    // Secondary health score derived directly from findings:
    // Base 100 - (critical * 25 + high * 8 + medium * 3 + low * 1)
    let score = 100;
    score -= counts.critical * 25;
    score -= counts.high * 8;
    score -= counts.medium * 3;
    score -= counts.low * 1;
    score = Math.max(0, Math.min(100, score));

    return {
      status: 'complete',
      findings,
      instances,
      score: findings.length === 0 ? 100 : score,
      startedAt: Date.now(),
      completedAt: Date.now(),
      engineVersion,
      skillVersions,
    };
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

  private emitChange(event: FindingStoreChangeEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (e) {
        console.error('Error in FindingStore listener:', e);
      }
    }
  }
}
