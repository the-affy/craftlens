import { Severity, CanonicalSeverity, toSemanticSeverity } from './severity.js';
import { SourceLocation, FindingLocation } from './location.js';
import { Evidence } from './evidence.js';
import { FixDescriptor, DesignFix } from './fix.js';
import { RuleRecommendation, RecommendationAlternative, SupportedAction } from './rule.js';
import { DesignIntent } from './intent.js';
import { Signal } from './signal.js';
import { FindingInstance, SkillVersion } from './skill.js';

export type FindingType = 'problem' | 'suggestion' | 'pattern_observation';

export type FindingCategory =
  | 'ui-ux'
  | 'content'
  | 'accessibility'
  | 'code'
  | 'code-quality'
  | 'security'
  | 'performance';

export type FindingStatus = 'open' | 'fixed' | 'rejected' | 'ignored' | 'stale';

export interface FindingSource {
  type: 'builtin' | 'user' | 'skill' | 'combined';
  name: string;
}

export interface Suggestion {
  id: string;
  title: string;
  explanation: string;
  type: 'autofix' | 'replace' | 'insert' | 'refactor' | 'manual';
  confidence: number;
  patch?: string;
  actionLabel?: 'Apply' | 'Apply Fix' | 'Suggested Fix' | 'Manual fix' | 'Replace' | 'Insert' | 'Open suggestion' | 'Copy fix' | 'Keep value' | 'Use existing token';
  safe?: boolean;
  previewDiff?: string;
  replacement?: string;
  range?: {
    startLine: number;
    startColumn?: number;
    endLine: number;
    endColumn?: number;
  };
}

export interface FindingFix {
  id?: string;
  title: string;
  kind?: 'safe' | 'assisted' | 'manual';
  description?: string;
  changes?: any[];
  isPreferred?: boolean;
}

export interface ResearchAttribution {
  skillId: string;
  domain: string;
  query?: string;
  recommendation: string;
}

export interface AuditState {
  status: 'idle' | 'running' | 'complete' | 'failed';
  statusMessage?: string;
  findings: Finding[];
  instances: FindingInstance[];
  score?: number;
  startedAt?: number;
  completedAt?: number;
  engineVersion: string;
  skillVersions: SkillVersion[];
}

export function normalizeCategory(cat?: string, ruleId?: string): FindingCategory {
  const c = (cat || '').toLowerCase();
  const rid = (ruleId || '').toUpperCase();

  if (c === 'ui-ux' || c === 'ui' || c === 'ux' || c === 'visual' || c === 'hierarchy') return 'ui-ux';
  if (c === 'content' || c === 'copy' || c === 'placeholder') return 'content';
  if (c === 'accessibility' || c === 'a11y') return 'accessibility';
  if (c === 'security') return 'security';
  if (c === 'performance' || c === 'perf') return 'performance';
  if (c === 'code' || c === 'code-quality' || c === 'functionality' || c === 'backend' || c === 'react') return 'code-quality';

  if (rid.startsWith('SEC-') || rid.startsWith('SEC')) return 'security';
  if (rid.startsWith('AX-')) return 'accessibility';
  if (rid.startsWith('CP-') || rid.startsWith('PH-')) return 'content';
  if (rid === 'CSS-005' || rid === 'UI-022') return 'performance';
  if (
    rid.startsWith('UI-') ||
    rid.startsWith('UX-') ||
    rid.startsWith('VH-') ||
    rid.startsWith('CL-') ||
    rid.startsWith('LY-') ||
    rid.startsWith('ID-') ||
    rid.startsWith('CX-')
  ) {
    return 'ui-ux';
  }
  return 'code-quality';
}

export interface AffectedElement {
  selector?: string;
  tagName?: string;
  className?: string;
  line?: number;
  location?: SourceLocation | FindingLocation;
  snippet?: string;
}

export type DesignTransformation =
  | 'distill'
  | 'reshape'
  | 'restructure'
  | 'differentiate'
  | 'hierarchize'
  | 'group'
  | 'simplify'
  | 'typeset'
  | 'colorize'
  | 'quieter'
  | 'clarify'
  | 'strengthen-content'
  | 'improve-interaction'
  | 'improve-responsive'
  | 'harden'
  | 'normalize'
  | 'polish';

export interface DesignRecommendation {
  id: string;
  title: string;
  transformation: DesignTransformation;
  description: string;
  whyItFits: string[];
  evidence: string[];
  tradeoff?: string;
  affectedElements: string[];
  implementationApproach?: string;
  confidence: number;
  scope: 'local' | 'component' | 'section' | 'page' | 'system';
  fix?: {
    type?: 'safe' | 'assisted' | 'manual';
    description?: string;
    edits?: any[];
    isPreferred?: boolean;
  };
  category?: string;
  target?: {
    filePath?: string;
    startLine?: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
  };
  proposedChanges?: {
    startLine?: number;
    endLine?: number;
    originalSnippet?: string;
    replacementSnippet?: string;
  }[];
}

export interface Finding {
  id?: string;
  ruleId: string;
  ruleVersion?: string;
  sourceSkillId?: string;
  sourceSkillVersion?: string;
  instances?: FindingInstance[];
  message: string;
  description?: string;
  title?: string;
  severity: Severity;
  semanticSeverity?: CanonicalSeverity;
  confidence: number;
  location: SourceLocation;
  primaryLocation?: SourceLocation;
  relatedLocations?: SourceLocation[];
  evidence: Evidence[] | any[];
  findingType?: FindingType;
  type?: FindingType;
  fingerprint?: string;
  recommendation?: string;
  recommendations?: DesignRecommendation[];
  fix?: FixDescriptor | FindingFix;
  relatedFindings?: string[];
  clusterId?: string;
  category?: FindingCategory | string;
  status?: FindingStatus;
  research?: ResearchAttribution;

  // Exact Section 17 Model Properties:
  filePath?: string;
  startLine?: number;
  endLine?: number;
  source?: FindingSource;
  suggestions?: Suggestion[];
  autoFixAvailable?: boolean;
  affectedElements?: AffectedElement[];
  falsePositiveCaveat?: string;
  detectedToken?: {
    name: string;
    value: string;
    type: 'color' | 'radius' | 'spacing' | 'component';
  };

  // Senior Reviewer 4 questions & CraftLens Core Synthesis:
  /** Human-friendly issue category/title (e.g. "Error handling") */
  problemTitle?: string;
  /** 1. What is wrong? */
  whatIsWrong?: string;
  /** Summary of what is wrong (alias/canonical) */
  summary?: string;
  /** 3. Why does it matter? */
  whyItMatters?: string;
  /** Why it matters (alias/canonical) */
  why?: string;
  /** 4. How should I fix it? */
  howToFix?: string;
  /** Step-by-step guidance list */
  suggestedSteps?: string[];

  // Verification & False-positive Handling
  /** How to verify the fix */
  verification?: string;
  /** Notes explaining when this pattern might be intentional/valid */
  falsePositiveNote?: string;
  falsePositiveContext?: string[];
  confidenceModel?: string;

  // Signal & Pattern lineage
  signals?: Signal[];
  patternId?: string;
  affectedComponents?: string[];
  affectedFiles?: string[];
  route?: string;

  // Design Intelligence & Senior Reviewer Extensions
  diagnosis?: string;
  structuredRecommendation?: RuleRecommendation;
  alternatives?: RecommendationAlternative[];
  designFix?: DesignFix;
  implementationGuide?: string;
  intent?: DesignIntent;
  supportedActions?: SupportedAction[];
}

export function ensureFindingCanonical(raw: Partial<Finding> & { ruleId: string; location: SourceLocation }): Finding {
  const ruleId = raw.ruleId || 'UNKNOWN';
  const category = normalizeCategory(raw.category as string, ruleId);
  const severity = raw.severity || 'warning';
  const title = raw.title || raw.problemTitle || raw.message || ruleId;
  const summary = raw.summary || raw.whatIsWrong || raw.message || title;
  const why = raw.why || raw.whyItMatters || raw.description || '';
  const fingerprint = raw.fingerprint || (raw.location ? computeFindingFingerprint(raw as any) : `${ruleId}_${title}`);
  const id = raw.id || fingerprint;
  const instances = raw.instances && raw.instances.length > 0 ? raw.instances.map((inst, idx) => ({
    ...inst,
    filePath: inst.filePath || inst.location?.filePath || raw.location?.filePath || '',
    line: inst.line ?? (inst.location as any)?.start?.line ?? (inst.location as any)?.range?.startLine ?? 1,
  })) : (raw.location ? [{
    id: `${id}_inst_1`,
    findingId: id,
    ruleId,
    location: raw.location,
    filePath: raw.location.filePath,
    line: (raw.location as any)?.start?.line ?? (raw.location as any)?.range?.startLine ?? 1,
    snippet: raw.evidence?.[0]?.snippet,
    evidence: raw.evidence || [],
    fix: raw.fix as any,
    status: 'open' as const,
  }] : []);

  return {
    ...raw,
    id,
    ruleId,
    category,
    severity,
    title,
    summary,
    instances,
    evidence: raw.evidence || [],
    why,
    recommendation: raw.recommendation || raw.howToFix,
    fix: raw.fix,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.9,
    status: raw.status || 'open',
    message: raw.message || title,
    location: raw.location,
    fingerprint,
    filePath: raw.filePath || raw.location?.filePath || '',
    startLine: raw.startLine ?? raw.location?.start?.line ?? 1,
    endLine: raw.endLine ?? raw.location?.end?.line ?? raw.startLine ?? 1,
    source: raw.source || { type: 'builtin', name: 'CraftLens' },
    suggestions: raw.suggestions || [],
    autoFixAvailable: raw.autoFixAvailable ?? (raw.suggestions ? raw.suggestions.some(s => s.type === 'autofix' && s.safe) : Boolean(raw.designFix || raw.fix)),
    semanticSeverity: toSemanticSeverity(severity),
    affectedElements: raw.affectedElements || [],
    falsePositiveCaveat: raw.falsePositiveCaveat || raw.falsePositiveNote,
    recommendations: raw.recommendations || [],
  };
}

export function computeFindingFingerprint(finding: {
  ruleId: string;
  location?: SourceLocation;
  message: string;
  evidence?: Evidence[];
}): string {
  // Deterministic fingerprint identifying this exact finding at this location
  const normEvidence = (Array.isArray(finding.evidence) ? finding.evidence : [])
    .filter((e): e is any => e !== null && e !== undefined)
    .map(e => {
      if (typeof e === 'string') return `evidence:${e.trim().replace(/\s+/g, ' ')}`;
      const typeStr = typeof e.type === 'string' ? e.type : 'evidence';
      const text = typeof e.snippet === 'string' ? e.snippet : typeof e.explanation === 'string' ? e.explanation : '';
      return `${typeStr}:${text.trim().replace(/\s+/g, ' ')}`;
    })
    .join('|');
  const filePath = finding.location?.filePath || 'unknown';
  const startLine = finding.location?.start?.line ?? 1;
  const startCol = finding.location?.start?.column ?? 1;
  const endLine = finding.location?.end?.line ?? 1;
  const endCol = finding.location?.end?.column ?? 1;
  const locStr = `${filePath}:${startLine}:${startCol}-${endLine}:${endCol}`;
  const base = `${finding.ruleId}::${locStr}::${(finding.message || '').trim()}::${normEvidence}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `${finding.ruleId}_${Math.abs(hash).toString(16)}`;
}

export function computeStructuralFingerprint(finding: {
  ruleId: string;
  location?: SourceLocation;
  evidence?: Evidence[];
}): string {
  // Fingerprint independent of line/column to identify moved findings
  const normEvidence = (Array.isArray(finding.evidence) ? finding.evidence : [])
    .filter((e): e is any => e !== null && e !== undefined)
    .map(e => {
      if (typeof e === 'string') return `evidence:${e.trim().replace(/\s+/g, ' ')}`;
      const typeStr = typeof e.type === 'string' ? e.type : 'evidence';
      const text = typeof e.snippet === 'string' ? e.snippet : typeof e.explanation === 'string' ? e.explanation : '';
      return `${typeStr}:${text.trim().replace(/\s+/g, ' ')}`;
    })
    .join('|');
  const filePath = finding.location?.filePath || 'unknown';
  const base = `${finding.ruleId}::${filePath}::${normEvidence}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `struct_${finding.ruleId}_${Math.abs(hash).toString(16)}`;
}


