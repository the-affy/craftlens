import { QARawFinding, CorrelatedFinding, QAEvidence, getConfidenceTier } from '../types.js';
import { Issue, IssueCategory, IssueSeverity, IssueLocation, IssueEvidence } from '../../types/issue.js';
import { IssueRegistry } from '../../issue-registry/issue-registry.js';
import { MultiPassReviewResult } from '../review/multi-pass-reviewer.js';

export interface CorrelatorInput {
  finding: QARawFinding;
  reviewResult?: MultiPassReviewResult;
}

export class FindingCorrelator {
  private issueRegistry?: IssueRegistry;

  constructor(issueRegistry?: IssueRegistry) {
    this.issueRegistry = issueRegistry;
  }

  public setIssueRegistry(registry: IssueRegistry): void {
    this.issueRegistry = registry;
  }

  /**
   * Correlates multi-source findings into consolidated CorrelatedFindings,
   * elevates confidence on multi-tool confirmation, and syncs to IssueRegistry.
   */
  public correlate(inputs: CorrelatorInput[]): {
    correlated: CorrelatedFinding[];
    canonicalIssues: Issue[];
  } {
    const groups = new Map<string, CorrelatorInput[]>();

    for (const input of inputs) {
      const f = input.finding;
      const key = this.computeCorrelationKey(f);
      const existing = groups.get(key) || [];
      existing.push(input);
      groups.set(key, existing);
    }

    const correlatedList: CorrelatedFinding[] = [];
    const canonicalIssues: Issue[] = [];

    for (const [key, cluster] of groups.entries()) {
      const primary = cluster[0].finding;
      const sources = Array.from(new Set(cluster.map(c => c.finding.sourceAnalyzer || 'craftlens-qa')));

      // Merge and deduplicate evidence
      const allEvidence: QAEvidence[] = [];
      const seenEvidence = new Set<string>();

      for (const item of cluster) {
        for (const ev of item.finding.evidence) {
          const evKey = `${ev.source}:${ev.description}:${ev.line || 0}`;
          if (!seenEvidence.has(evKey)) {
            seenEvidence.add(evKey);
            allEvidence.push(ev);
          }
        }
      }

      // Elevate confidence with multiple independent sources
      let maxConfidence = Math.max(...cluster.map(c => c.reviewResult?.finalConfidence ?? c.finding.confidence));
      if (sources.length > 1) {
        maxConfidence = Math.min(0.99, maxConfidence + (sources.length - 1) * 0.08);
      }

      // Severity precedence: critical > high > medium > low > suggestion
      const severity = this.resolveHighestSeverity(cluster.map(c => c.finding.severity));

      // Locations
      const allLocations = cluster.map(c => ({
        filePath: c.finding.filePath,
        startLine: c.finding.startLine || 1,
        startColumn: c.finding.startColumn || 1,
        endLine: c.finding.endLine || c.finding.startLine || 1,
        endColumn: c.finding.endColumn || 100,
      }));

      // Unified Multi-pass review summary
      const reviewResult = cluster.find(c => c.reviewResult)?.reviewResult;

      const correlatedId = `CL-${primary.ruleId.toUpperCase()}-${Math.abs(this.hashString(key))}`;

      const correlated: CorrelatedFinding = {
        id: correlatedId,
        ruleId: primary.ruleId,
        title: primary.title,
        summary: primary.message,
        category: primary.category,
        severity,
        confidence: maxConfidence,
        confidenceTier: getConfidenceTier(maxConfidence),
        primaryLocation: allLocations[0],
        allLocations,
        evidence: allEvidence,
        inference: primary.inference || primary.message,
        recommendation: primary.recommendation || 'Remediate this finding according to security and quality guidelines.',
        sources,
        multiPassReview: reviewResult ? {
          reviewerA: reviewResult.reviewerA,
          reviewerB: reviewResult.reviewerB,
          reviewerC: reviewResult.reviewerC,
        } : undefined,
        canonicalIssueId: correlatedId,
      };

      correlatedList.push(correlated);

      // Convert to Canonical Issue
      const canonicalIssue = this.toCanonicalIssue(correlated);
      canonicalIssues.push(canonicalIssue);

      // Single Source of Truth: Register into IssueRegistry
      if (this.issueRegistry) {
        const existingIssue = this.issueRegistry.getIssueByFingerprint(canonicalIssue.fingerprint);
        if (existingIssue) {
          this.issueRegistry.updateIssue(existingIssue.id, {
            ...canonicalIssue,
            id: existingIssue.id, // preserve ID
            lastDetectedAt: new Date().toISOString(),
          });
        } else {
          this.issueRegistry.registerIssue(canonicalIssue);
        }
      }
    }

    return { correlated: correlatedList, canonicalIssues };
  }

  private computeCorrelationKey(f: QARawFinding): string {
    const normFile = (f.filePath || '').toLowerCase().replace(/\\/g, '/');
    const lineBucket = f.startLine ? Math.floor(f.startLine / 5) * 5 : 0;
    const rulePrefix = f.ruleId.split('-')[0] || f.category;
    return `${normFile}::${lineBucket}::${rulePrefix}`;
  }

  private resolveHighestSeverity(severities: IssueSeverity[]): IssueSeverity {
    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    if (severities.includes('low')) return 'low';
    return 'suggestion';
  }

  private toCanonicalIssue(c: CorrelatedFinding): Issue {
    const locations: IssueLocation[] = c.allLocations.map(loc => ({
      filePath: loc.filePath,
      range: {
        startLine: loc.startLine,
        startColumn: loc.startColumn || 1,
        endLine: loc.endLine || loc.startLine,
        endColumn: loc.endColumn || 100,
      },
    }));

    const evidenceList: IssueEvidence[] = c.evidence.map(ev => ({
      type: ev.type,
      message: ev.description,
      confidence: c.confidence,
      snippet: ev.snippet,
      location: ev.filePath ? {
        filePath: ev.filePath,
        range: {
          startLine: ev.line || 1,
          startColumn: ev.column || 1,
          endLine: ev.line || 1,
          endColumn: 100,
        },
      } : undefined,
    }));

    const now = new Date().toISOString();

    return {
      id: c.id,
      fingerprint: `qa:${c.ruleId}:${c.primaryLocation.filePath}:${c.primaryLocation.startLine}`,
      ruleId: c.ruleId,
      title: c.title,
      summary: c.summary,
      category: c.category,
      severity: c.severity,
      confidence: c.confidence,
      status: 'open',
      locations,
      evidence: evidenceList,
      whyItMatters: c.inference,
      recommendation: c.recommendation,
      skillId: 'qa-release-assurance',
      changeIds: [],
      firstDetectedAt: now,
      lastDetectedAt: now,
      message: c.summary,
      filePath: c.primaryLocation.filePath,
      startLine: c.primaryLocation.startLine,
      endLine: c.primaryLocation.endLine,
      whatIsWrong: c.summary,
      why: c.inference,
      howToFix: c.recommendation,
      autoFixAvailable: false,
    };
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}

