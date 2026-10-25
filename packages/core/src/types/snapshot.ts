import { SkillVersion } from './skill.js';
import { Finding } from './finding.js';

export interface RuleVersionRef {
  id: string;
  version: string;
}

export interface AuditSnapshotSummary {
  totalFindings: number;
  errorCount: number;
  warningCount: number;
  suggestionCount: number;
}

export interface AuditSnapshot {
  id: string;
  timestamp: string;
  engineVersion: string;
  skills: SkillVersion[];
  rules: RuleVersionRef[];
  findings: Finding[];
  projectHash: string;
  summary?: AuditSnapshotSummary;
}

export interface AuditDiff {
  previousSnapshotId: string;
  currentSnapshotId: string;
  resolvedFindings: Finding[];
  newFindings: Finding[];
  unresolvedFindings: Finding[];
  netImprovement: number;
  previousCount: number;
  currentCount: number;
}
