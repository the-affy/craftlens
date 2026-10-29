import { IssueCategory, IssueSeverity, Issue } from '../types/issue.js';
import { ProjectContext } from '../types/context.js';

export type QACategory =
  | 'correctness'
  | 'security'
  | 'architecture'
  | 'code-quality'
  | 'runtime'
  | 'webview'
  | 'extension'
  | 'dependencies'
  | 'tests'
  | 'packaging'
  | 'state';

export type QAMode =
  | 'quick'
  | 'change'
  | 'full'
  | 'security'
  | 'release'
  | 'deep'
  | 'self';

export type QAAnalyzerStatus =
  | 'pass'
  | 'fail'
  | 'warn'
  | 'skipped'
  | 'not_available'
  | 'not_run';

export type ReleaseGateResult =
  | 'RELEASE PASS'
  | 'RELEASE PASS WITH WARNINGS'
  | 'RELEASE BLOCKED';

export type ConfidenceTier =
  | 'speculative'   // 0.00 - 0.39
  | 'weak'          // 0.40 - 0.59
  | 'probable'      // 0.60 - 0.79
  | 'high'          // 0.80 - 0.94
  | 'very_high';     // 0.95 - 1.00

export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.95) return 'very_high';
  if (confidence >= 0.80) return 'high';
  if (confidence >= 0.60) return 'probable';
  if (confidence >= 0.40) return 'weak';
  return 'speculative';
}

export interface QAEvidence {
  type: string;
  description: string;
  source: string;
  filePath?: string;
  line?: number;
  column?: number;
  snippet?: string;
  details?: string;
}

export interface QARawFinding {
  id?: string;
  ruleId: string;
  title: string;
  message: string;
  category: IssueCategory;
  severity: IssueSeverity;
  confidence: number;
  filePath: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  evidence: QAEvidence[];
  inference?: string;
  recommendation?: string;
  sourceAnalyzer: string;
  fingerprint?: string;
  fix?: any;
  suggestions?: any[];
}

export interface CorrelatedFinding {
  id: string;
  ruleId: string;
  title: string;
  summary: string;
  category: IssueCategory;
  severity: IssueSeverity;
  confidence: number;
  confidenceTier: ConfidenceTier;
  primaryLocation: {
    filePath: string;
    startLine: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
  };
  allLocations: {
    filePath: string;
    startLine: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
  }[];
  evidence: QAEvidence[];
  inference: string;
  recommendation: string;
  sources: string[];
  multiPassReview?: {
    reviewerA?: { passed: boolean; note: string };
    reviewerB?: { disproven: boolean; reason?: string };
    reviewerC?: { architecturalRisk?: string };
  };
  canonicalIssueId?: string;
}

export interface QAContext {
  workspaceRoot: string;
  projectContext: ProjectContext;
  mode: QAMode;
  changedFiles?: string[];
  isSelfQA?: boolean;
  engine?: any;
  findingStore?: any;
  issueRegistry?: any;
  changeManager?: any;
  verificationEngine?: any;
  skillManager?: any;
  options?: Record<string, any>;
}

export interface QAResult {
  analyzerId: string;
  analyzerName: string;
  category: QACategory;
  status: QAAnalyzerStatus;
  durationMs: number;
  findings: QARawFinding[];
  metrics?: Record<string, number | string | boolean>;
  skipReason?: string;
  notes?: string;
}

export interface QAAnalyzer {
  id: string;
  name: string;
  category: QACategory;
  isAvailable(context: QAContext): Promise<boolean>;
  analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult>;
}

export interface QACheckSummary {
  id: string;
  name: string;
  category: QACategory;
  status: QAAnalyzerStatus;
  durationMs: number;
  notes?: string;
  findingsCount: number;
}

export interface QAReport {
  id: string;
  timestamp: number;
  mode: QAMode;
  durationMs: number;
  gateResult: ReleaseGateResult;
  gateReasons: string[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    suggestions: number;
    total: number;
    unconfirmedDiscarded: number;
  };
  checks: QACheckSummary[];
  analyzerResults: QAResult[];
  correlatedFindings: CorrelatedFinding[];
  canonicalIssues: Issue[];
}

