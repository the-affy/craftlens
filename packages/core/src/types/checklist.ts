import { AuditLevel } from './audit-level.js';
import { Finding } from './finding.js';

export type ChecklistItemStatus =
  | 'pending'
  | 'passed'
  | 'warning'
  | 'failed'
  | 'not-applicable'
  | 'not_applicable'
  | 'ignored'
  | 'needs-review';

export interface ChecklistCriterion {
  id: string;
  category?: string;
  title: string;
  description?: string;
  source?: string;
  relatedRuleIds?: string[];
  checked: boolean;
  manualOverride?: boolean;
}

export interface ChecklistItem extends ChecklistCriterion {
  id: string;
  category: string;
  title: string;
  description: string;
  status: ChecklistItemStatus;
  evidence?: string;
  relatedRules?: string[];
  relatedRuleIds?: string[];
  checked: boolean;
  manualOverride?: boolean;
  source?: string;
  findingCount?: number;
  lastChecked: number;
  /** Human friendly explanation when check is not relevant or not detected */
  notApplicableReason?: string;
  /** Display label (e.g. 'Not relevant to this project' or 'Not detected in this project') */
  statusLabel?: string;
}

export interface MasterChecklistSummary {
  errors: number;
  warnings: number;
  suggestions: number;
  passed: number;
  total: number;
  healthScore: number;
  healthGrade?: 'Healthy' | 'Needs Attention' | 'Critical';
  healthExplanation?: string;
  passPercentage?: number;
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
    design?: number;
  };

  potentialConcerns: string[];
}
