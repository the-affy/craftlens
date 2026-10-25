import { Severity } from './severity.js';
import { FixPolicy, FixSafety } from './fix.js';
import { Finding } from './finding.js';
import { AnalysisContext, DetectionEngine, Platform, RuleCategory } from './context.js';
import { AuditLevel } from './audit-level.js';
import { Signal } from './signal.js';
import { FixStrategy, RuleConfidence, RuleExample } from './skill.js';

export interface RecommendationAlternative {
  id: string;
  title: string;
  description: string;
  whenToUse?: string;
  tradeoffs?: string[];
  implementationDifficulty?: 'easy' | 'medium' | 'hard';
}

export interface RuleRecommendation {
  summary: string;
  /** Why this matters: Rationale and impact of the issue */
  why?: string;
  /** Backwards compatibility alias for why */
  rationale?: string;
  /** How to fix: Direct actionable instructions */
  howToFix?: string;
  /** Suggested step-by-step approach */
  steps?: string[];
  alternatives?: RecommendationAlternative[];
  fix?: {
    type: FixSafety;
    description: string;
  };
}

export type SupportedAction =
  | 'fix'
  | 'preview'
  | 'suggest_better_design'
  | 'explain'
  | 'not_a_problem';

export type RuleMethod = 'deterministic' | 'heuristic' | 'contextual';

export interface Rule {
  /** Stable unique identifier (e.g., AP-008, core.code.exception-swallowing) */
  id: string;
  /** Semantic version of rule (e.g., 1.0.0) */
  version?: string;
  /** Human-readable rule name */
  name?: string;
  /** Title alias for name */
  title?: string;
  description: string;
  category: RuleCategory;
  severity: Severity;

  /** Minimum audit sensitivity level required for this rule to trigger */
  minAuditLevel?: AuditLevel;
  minimumAuditLevel?: AuditLevel;

  /** Originating skill identifier */
  sourceSkillId?: string;
  /** Originating skill version */
  sourceSkillVersion?: string;

  /** Confidence level classification */
  confidenceLevel?: RuleConfidence;
  /** Confidence score between 0.0 and 1.0 */
  confidence?: number;
  confidenceModel?: string;

  engine?: DetectionEngine;
  method?: RuleMethod;
  platforms?: Platform[];
  tags?: string[];
  evidenceRequired?: boolean;

  recommendation?: string | RuleRecommendation;
  structuredRecommendation?: RuleRecommendation;
  fix?: FixPolicy;
  fixStrategy?: FixStrategy;
  safeFix?: boolean;

  prerequisites?: string[];
  signals?: Signal[];
  falsePositiveConditions?: string[];
  falsePositiveGuards?: string[];
  positiveFixtures?: string[];
  negativeFixtures?: string[];
  clusterGroups?: string[];
  relatedRules?: string[];
  verification?: string;
  examples?: RuleExample[];

  // 4 Core Questions & Senior Reviewer Guidance:
  problemTitle?: string;
  whatIsWrong?: string;
  whyItMatters?: string;
  rationale?: string;
  howToFix?: string;
  suggestedSteps?: string[];
  diagnosis?: string;
  implementationGuide?: string;
  supportedActions?: SupportedAction[];

  /** Primary detection entry point */
  detect(context: AnalysisContext): Finding[];
}

export type CraftLensRule = Rule & {
  title: string;
  rationale: string;
  confidence: number;
  engine: DetectionEngine;
  recommendation: string;
  fix: FixPolicy;
  platforms: Platform[];
};

export function getRuleName(rule: Rule): string {
  return rule.name || rule.title || rule.id;
}

export function getRuleVersion(rule: Rule): string {
  return rule.version || '1.0.0';
}

export function getRuleAuditLevel(rule: Rule): AuditLevel {
  return rule.minAuditLevel || rule.minimumAuditLevel || 'easy';
}
