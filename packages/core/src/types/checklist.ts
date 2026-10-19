import { AuditLevel } from './audit-level.js';
import { Finding } from './finding.js';

export type ChecklistItemStatus =
  | 'pending'
  | 'passed'
  | 'warning'
  | 'failed'
  | 'not-applicable'
  | 'ignored'
  | 'needs-review';

export interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  status: ChecklistItemStatus;
  evidence?: string;
  relatedRules?: string[];
  findingCount?: number;
  lastChecked: number;
}

export interface MasterChecklistSummary {
  errors: number;
  warnings: number;
  suggestions: number;
  passed: number;
  total: number;
  healthScore: number;
}

export interface MasterChecklist {
  projectName: string;
  lastAudit: number;
  auditLevel: AuditLevel;
  summary: MasterChecklistSummary;
  items: ChecklistItem[];
}

export interface AuditHistoryEntry {
  auditNumber: number;
  timestamp: number;
  level: AuditLevel;
  totalFindings: number;
  errors: number;
  warnings: number;
  suggestions: number;
  resolvedSincePrevious: number;
  newFindings: number;
}

export interface ChangeReview {
  timestamp: number;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  newFindings: Finding[];
  resolvedFindings: Finding[];
  qualityScores: {
    code: number;
    architecture: number;
    ux: number;
    accessibility: number;
    security: number;
    aiSlop: number;
  };
  potentialConcerns: string[];
}
