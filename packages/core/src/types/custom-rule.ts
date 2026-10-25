import { RuleCategory } from './context.js';
import { FindingCategory } from './finding.js';
import { Severity } from './severity.js';
import { AuditLevel } from './audit-level.js';
import { FixSafety } from './fix.js';
import { RecommendationAlternative } from './rule.js';

export type CustomRuleDetectionType = 'css' | 'regex' | 'text' | 'ast' | 'dependency';

export interface CustomRuleScope {
  include?: string[];
  exclude?: string[];
}

export interface CustomRuleDetection {
  type: CustomRuleDetectionType;
  /** Regex pattern or substring to match */
  pattern?: string;
  /** CSS selector or CSS property to match */
  selector?: string;
  /** AST node type (e.g. JsxElement, TryStatement, AnyKeyword) */
  astNodeType?: string;
  /** Dependency package name to check */
  dependencyName?: string;
  /** Regex flags (e.g. 'i', 'g') */
  flags?: string;
}

export interface CustomRuleDefinition {
  id: string;
  name: string;
  category: RuleCategory;
  description: string;
  rationale: string;
  severity: Severity;
  minimumAuditLevel?: AuditLevel;
  scope?: CustomRuleScope;
  detection: CustomRuleDetection;
  recommendation?: {
    summary: string;
    rationale?: string;
    alternatives?: RecommendationAlternative[];
  };
  fix?: {
    type: FixSafety;
    replacement?: string;
    description?: string;
  };
  tags?: string[];
  enabled?: boolean;
}

export interface UserRuleItem {
  id: string;
  name: string;
  title: string;
  description: string;
  category: RuleCategory | FindingCategory | string;
  severity: Severity;
  source: {
    type: 'user';
    name: string;
  };
  detectionMethod: 'pattern' | 'regex' | 'ast' | 'token' | 'text';
  pattern?: string;
  enabled: boolean;
  whyItMatters?: string;
  howToFix?: string;
  suggestedFix?: string;
  groupId: string;
}

export interface UserRuleGroup {
  id: string;
  name: string;
  source: 'upload' | 'url' | 'pasted' | 'manual';
  sourceUrl?: string;
  importedAt: number;
  expanded?: boolean;
  rules: UserRuleItem[];
}


export type DismissalReason =
  | 'brand_requirement'
  | 'product_requirement'
  | 'design_system'
  | 'accessibility_requirement'
  | 'framework_convention'
  | 'intentional_exception'
  | 'false_positive'
  | 'other';

export interface UserFindingDismissal {
  fingerprint: string;
  ruleId: string;
  filePath: string;
  line: number;
  reason: DismissalReason;
  comment?: string;
  timestamp: number;
}
