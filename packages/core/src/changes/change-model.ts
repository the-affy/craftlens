import { VerificationState } from '../types/issue.js';

export type ChangeStatus =
  | 'draft'
  | 'proposed'
  | 'review'
  | 'approved'
  | 'applied'
  | 'verifying'
  | 'verified'
  | 'rejected'
  | 'reverted'
  | 'failed';

export interface ChangeFileEdit {
  startLine: number;
  startColumn?: number;
  endLine: number;
  endColumn?: number;
  originalText?: string;
  replacementText: string;
}

export interface ChangeFile {
  filePath: string;
  additions: number;
  deletions: number;
  originalContent?: string;
  newContent?: string;
  patch?: string;
  edits?: ChangeFileEdit[];
}

export interface Change {
  id: string;
  issueIds: string[];
  title: string;
  explanation: string;
  status: ChangeStatus;
  files: ChangeFile[];
  patch?: unknown;
  verification?: VerificationState;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
}

export interface ChangePlan {
  id: string;
  title: string;
  summary: string;
  linkedIssueIds: string[];
  issueIds?: string[];
  changeIds: string[];
  affectedFiles: string[];
  expectedOutcome: string;
  verificationStrategy: string;
  status: 'draft' | 'proposed' | 'approved' | 'applied' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
}
