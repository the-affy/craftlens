import { Severity } from './severity.js';
import { FixPolicy } from './fix.js';
import { Finding } from './finding.js';
import { AnalysisContext, DetectionEngine, Platform, RuleCategory } from './context.js';

export interface AntiSlopRule {
  /** Stable unique identifier (e.g., AP-008, FN-015) */
  id: string;
  category: RuleCategory;
  title: string;
  description: string;
  rationale: string;
  severity: Severity;
  /** Confidence between 0.0 and 1.0 */
  confidence: number;
  engine: DetectionEngine;
  recommendation: string;
  fix: FixPolicy;
  platforms: Platform[];
  tags: string[];
  clusterGroups?: string[];
  relatedRules?: string[];
  /** Primary detection entry point */
  detect(context: AnalysisContext): Finding[];
}
