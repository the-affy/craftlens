import { Finding } from './finding.js';

export interface RuleCluster {
  id: string;
  name: string;
  description: string;
  rules: string[];
  minSignals: number;
  calculateConfidence(findings: Finding[]): number;
  createFinding(findings: Finding[]): Finding | null;
}
