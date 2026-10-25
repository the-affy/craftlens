import { Severity } from './severity.js';
import { AuditLevel } from './audit-level.js';
import { RuleCategory, ProjectContext, AnalysisContext } from './context.js';
import { SourceLocation } from './location.js';
import { Evidence } from './evidence.js';
import { FixDescriptor, FixPolicy, FixSafety } from './fix.js';
import { RuleRecommendation, RecommendationAlternative, SupportedAction } from './rule.js';

export type SkillMode = 'replace' | 'augment';

export type RuleExecutionMode = 'builtin' | 'custom' | 'user' | 'combined';

export type SkillTrustStatus = 'builtin' | 'verified' | 'user' | 'external' | 'untrusted';

export type SkillStatus =
  | 'available'
  | 'active'
  | 'inactive'
  | 'installing'
  | 'installed'
  | 'error'
  | 'update-available';

export interface Skill {
  id: string;
  name: string;
  description: string;
  source: 'builtin' | 'local' | 'github' | 'skills-sh' | 'user-uploaded';
  repository?: string;
  path?: string;
  version?: string;
  installed: boolean;
  active: boolean;
  status: SkillStatus;
  installedAt?: string;
  updatedAt?: string;
  capabilities?: string[];
  checksum?: string;
  originalFilePath?: string;
  compatibility?: 'compatible' | 'partial' | 'incompatible';
  compatibilityNote?: string;
  hasExecutableAssets?: boolean;
  installsCount?: number;
  rating?: number;
  stars?: number;
  author?: string;
  installProgress?: string;
  rulesCount?: number;
  tags?: string[];
  category?: 'design' | 'code' | 'quality' | 'workflow';
  readmeUrl?: string;
}

export type RuleConfidence =
  | 'deterministic'
  | 'high-confidence'
  | 'contextual'
  | 'reasoning'
  | 'advisory';

export type SkillSource =
  | {
      type: 'builtin';
      id: string;
    }
  | {
      type: 'file';
      path: string;
    }
  | {
      type: 'directory';
      path: string;
    }
  | {
      type: 'github';
      url: string;
      commit?: string;
      branch?: string;
      retrievedAt?: string;
      subpath?: string;
    };

export interface SkillVersion {
  skillId: string;
  version: string;
  contentHash: string;
  installedAt: string;
  source: SkillSource;
  ruleCount: number;
  commit?: string;
}

export interface SkillAppliesTo {
  frameworks?: string[];
  categories?: string[];
  projects?: string[];
}

export interface SkillManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  license: string;
  source: SkillSource;
  repository?: string;
  homepage?: string;
  engineCompatibility?: string;
  appliesTo?: SkillAppliesTo;
  mode?: SkillMode;
  tags?: string[];
}

export interface RuleExample {
  title?: string;
  description?: string;
  badSnippet?: string;
  goodSnippet?: string;
  explanation?: string;
}

export interface Guidance {
  id: string;
  title: string;
  content: string;
  category?: string;
  context?: string[];
}

export interface FixStrategy {
  id: string;
  title: string;
  description: string;
  type: FixSafety;
  replacement?: string;
  steps?: string[];
}

export interface PatternDefinition {
  id: string;
  name: string;
  description: string;
  category?: string;
  signals?: string[];
}

export interface SkillStats {
  findingsProduced: number;
  fixesApplied: number;
  falsePositiveDismissals: number;
  activeRules: number;
  disabledRules: number;
}

export interface SkillPackage {
  manifest: SkillManifest;
  rules: any[]; // Rule[] - circular reference resolved below
  patterns: PatternDefinition[];
  recommendations: RuleRecommendation[];
  fixStrategies: FixStrategy[];
  guidance: Guidance[];
  examples?: RuleExample[];
  source: SkillSource;
  version: SkillVersion;
  history?: SkillVersion[];
  trustStatus?: SkillTrustStatus;
  enabled?: boolean;
  stats?: SkillStats;
}

export interface RuleOverride {
  ruleId: string;
  enabled?: boolean;
  severity?: Severity;
  mode?: 'detect' | 'detect_and_fix' | 'advisory';
}

export interface FindingInstance {
  id: string;
  findingId?: string;
  ruleId: string;
  location: SourceLocation;
  filePath?: string;
  line?: number;
  snippet?: string;
  evidence: Evidence[];
  fix?: FixDescriptor | any;
  status?: 'open' | 'active' | 'suppressed' | 'fixed' | 'dismissed' | 'rejected' | 'ignored' | 'stale';
}

export interface RuleContextPacket {
  projectContext: ProjectContext;
  relevantRules: any[];
  evidence: Evidence[];
  affectedInstances: FindingInstance[];
  designSystem: Record<string, unknown>;
  research: RuleRecommendation[];
  userOverrides: RuleOverride[];
}

export interface RuleExplanation {
  rule: any;
  whyItMatters: string;
  detects: string;
  doesNotDetect: string;
  falsePositives: string[];
  recommendation: string;
  fixType: string;
  examples?: RuleExample[];
  instancesCount?: number;
}

export interface SkillChangeSummary {
  skillId: string;
  fromVersion: string;
  toVersion: string;
  addedRules: string[];
  changedRules: string[];
  removedRules: string[];
  fixedIssues: string[];
}
