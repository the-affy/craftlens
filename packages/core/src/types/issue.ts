import { Severity, CanonicalSeverity, toSemanticSeverity } from './severity.js';
import { SourceLocation, FindingLocation, normalizeFindingLocation } from './location.js';
import { Evidence } from './evidence.js';
import { FixDescriptor, DesignFix } from './fix.js';
import { Suggestion, DesignRecommendation, Finding, FindingFix } from './finding.js';
import { FindingInstance } from './skill.js';

export type IssueStatus =
  | 'open'
  | 'planned'
  | 'proposed'
  | 'review'
  | 'applied'
  | 'verifying'
  | 'resolved'
  | 'rejected'
  | 'ignored'
  | 'accepted-risk'
  | 'needs-revalidation';

export type IssueCategory =
  | 'ui'
  | 'backend'
  | 'security'
  | 'performance'
  | 'accessibility'
  | 'quality'
  | 'dependency';

export type IssueSeverity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'suggestion';

export interface IssueLocation {
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  symbol?: string;
}

export interface IssueEvidence {
  type: string;
  message: string;
  location?: IssueLocation;
  confidence?: number;
  snippet?: string;
}

export interface IssueFingerprint {
  ruleId?: string;
  category: string;
  normalizedFilePath?: string;
  symbol?: string;
  contextHash?: string;
}

export interface VerificationCheck {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
}

export interface VerificationState {
  status: 'pending' | 'passed' | 'failed' | 'partial' | 'not-run';
  checks: VerificationCheck[];
  timestamp?: string;
}

export interface IssueDismissal {
  reason?: string;
  timestamp: string;
}

export interface Issue {
  id: string;
  fingerprint: string;
  ruleId: string;
  title: string;
  summary: string;
  category: IssueCategory;
  severity: IssueSeverity;
  confidence: number;
  status: IssueStatus;
  locations: IssueLocation[];
  evidence: IssueEvidence[];
  whyItMatters: string;
  recommendation?: string;
  skillId?: string;
  checklistItemId?: string;
  changeIds: string[];
  verification?: VerificationState;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt?: string;
  dismissed?: IssueDismissal;

  // Compatibility fields with Finding for seamless interoperability
  message?: string;
  location?: SourceLocation;
  primaryLocation?: SourceLocation;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  suggestions?: Suggestion[];
  recommendations?: DesignRecommendation[];
  fix?: FixDescriptor | FindingFix | any;
  designFix?: DesignFix;
  autoFixAvailable?: boolean;
  instances?: FindingInstance[];
  whatIsWrong?: string;
  howToFix?: string;
  why?: string;
  problemTitle?: string;
  semanticSeverity?: CanonicalSeverity;
}

export function normalizeIssueCategory(cat?: string, ruleId?: string): IssueCategory {
  const c = (cat || '').toLowerCase().trim();
  const rid = (ruleId || '').toUpperCase().trim();

  if (c === 'ui' || c === 'ui-ux' || c === 'ux' || c === 'visual' || c === 'hierarchy') return 'ui';
  if (c === 'security' || c === 'sec') return 'security';
  if (c === 'accessibility' || c === 'a11y') return 'accessibility';
  if (c === 'performance' || c === 'perf') return 'performance';
  if (c === 'backend' || c === 'api' || c === 'server') return 'backend';
  if (c === 'dependency' || c === 'deps' || c === 'package') return 'dependency';
  if (c === 'quality' || c === 'code' || c === 'code-quality') return 'quality';

  if (rid.startsWith('SEC-') || rid.startsWith('SEC')) return 'security';
  if (rid.startsWith('AX-')) return 'accessibility';
  if (rid === 'CSS-005' || rid === 'UI-022' || rid.startsWith('PERF-')) return 'performance';
  if (rid.startsWith('API-') || rid.startsWith('BE-')) return 'backend';
  if (rid.startsWith('DEP-')) return 'dependency';
  if (
    rid.startsWith('UI-') ||
    rid.startsWith('UX-') ||
    rid.startsWith('VH-') ||
    rid.startsWith('CL-') ||
    rid.startsWith('LY-') ||
    rid.startsWith('ID-') ||
    rid.startsWith('CX-') ||
    rid.startsWith('CP-') ||
    rid.startsWith('PH-')
  ) {
    return 'ui';
  }
  return 'quality';
}

export function normalizeIssueSeverity(sev?: string): IssueSeverity {
  const s = (sev || '').toLowerCase().trim();
  if (s === 'critical' || s === 'blocker') return 'critical';
  if (s === 'high' || s === 'error') return 'high';
  if (s === 'medium' || s === 'warning' || s === 'moderate') return 'medium';
  if (s === 'low' || s === 'info') return 'low';
  if (s === 'suggestion' || s === 'hint') return 'suggestion';
  return 'medium';
}

export function normalizeIssueLocation(loc?: SourceLocation | IssueLocation | any, fallbackFilePath = 'unknown'): IssueLocation {
  if (!loc) {
    return {
      filePath: fallbackFilePath,
      range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
    };
  }
  if (loc.range && typeof loc.range.startLine === 'number') {
    return {
      filePath: loc.filePath || fallbackFilePath,
      range: {
        startLine: Math.max(1, loc.range.startLine),
        startColumn: Math.max(1, loc.range.startColumn ?? 1),
        endLine: Math.max(loc.range.startLine, loc.range.endLine ?? loc.range.startLine),
        endColumn: Math.max(1, loc.range.endColumn ?? 1),
      },
      symbol: loc.symbol,
    };
  }
  const startLine = Math.max(1, loc.start?.line ?? loc.line ?? 1);
  const startCol = Math.max(1, loc.start?.column ?? loc.column ?? 1);
  const endLine = Math.max(startLine, loc.end?.line ?? startLine);
  const endCol = Math.max(1, loc.end?.column ?? (startCol + 1));

  return {
    filePath: loc.filePath || fallbackFilePath,
    range: {
      startLine,
      startColumn: startCol,
      endLine,
      endColumn: endCol,
    },
    symbol: loc.symbol,
  };
}

export function findingToIssue(finding: Finding): Issue {
  const ruleId = finding.ruleId || 'UNKNOWN';
  const category = normalizeIssueCategory(finding.category as string, ruleId);
  const severity = normalizeIssueSeverity(finding.severity as string);
  const instanceLoc = (finding as any).instances?.[0];
  const filePath =
    finding.filePath ||
    finding.location?.filePath ||
    instanceLoc?.filePath ||
    instanceLoc?.location?.filePath ||
    'unknown';
  const rawLoc =
    finding.location ||
    (instanceLoc
      ? instanceLoc.location || {
          filePath: instanceLoc.filePath || filePath,
          range: {
            startLine: instanceLoc.startLine || 1,
            startColumn: instanceLoc.startColumn || 1,
            endLine: instanceLoc.endLine || instanceLoc.startLine || 1,
            endColumn: instanceLoc.endColumn || 1,
          },
        }
      : undefined);
  const loc = normalizeIssueLocation(rawLoc, filePath);
  const title = finding.problemTitle || finding.title || finding.message || ruleId;
  const summary = finding.whatIsWrong || finding.summary || finding.message || title;
  const whyItMatters = finding.whyItMatters || finding.why || finding.description || '';
  const recommendation = finding.howToFix || finding.recommendation;

  const locations: IssueLocation[] = [loc];
  if (Array.isArray(finding.relatedLocations)) {
    for (const rl of finding.relatedLocations) {
      locations.push(normalizeIssueLocation(rl, filePath));
    }
  }

  const evidence: IssueEvidence[] = Array.isArray(finding.evidence)
    ? finding.evidence
        .filter((ev): ev is any => ev !== null && ev !== undefined)
        .map((ev: any) => {
          if (typeof ev === 'string') {
            return { type: 'snippet', message: ev };
          }
          return {
            type: typeof ev.type === 'string' ? ev.type : 'snippet',
            message: typeof ev.explanation === 'string' ? ev.explanation : typeof ev.message === 'string' ? ev.message : typeof ev.snippet === 'string' ? ev.snippet : '',
            location: ev.location ? normalizeIssueLocation(ev.location, filePath) : undefined,
            confidence: typeof ev.confidence === 'number' ? ev.confidence : undefined,
            snippet: typeof ev.snippet === 'string' ? ev.snippet : undefined,
          };
        })
    : [];

  const nowIso = new Date().toISOString();
  const id = finding.id || finding.fingerprint || `${ruleId}_${loc.filePath}_${loc.range.startLine}`;
  const fingerprint = finding.fingerprint || id;

  let status: IssueStatus = 'open';
  if (finding.status === 'fixed') status = 'resolved';
  else if (finding.status === 'ignored') status = 'ignored';
  else if (finding.status === 'rejected') status = 'rejected';
  else if (finding.status === 'stale') status = 'needs-revalidation';

  return {
    id,
    fingerprint,
    ruleId,
    title,
    summary,
    category,
    severity,
    confidence: typeof finding.confidence === 'number' ? finding.confidence : 0.9,
    status,
    locations,
    evidence,
    whyItMatters,
    recommendation,
    skillId: finding.sourceSkillId,
    changeIds: [],
    firstDetectedAt: nowIso,
    lastDetectedAt: nowIso,
    // Compatibility fields
    message: finding.message || title,
    location: finding.location,
    primaryLocation: finding.primaryLocation || finding.location,
    filePath,
    startLine: loc.range.startLine,
    endLine: loc.range.endLine,
    suggestions: finding.suggestions || [],
    recommendations: finding.recommendations || [],
    fix: finding.fix,
    designFix: finding.designFix,
    autoFixAvailable: finding.autoFixAvailable ?? Boolean(
      (finding.fix && (finding.fix as any) !== 'manual') ||
      finding.designFix ||
      (Array.isArray(finding.suggestions) && finding.suggestions.some((s: any) => s?.safe || s?.type === 'autofix'))
    ),
    instances: finding.instances || [],
    whatIsWrong: summary,
    howToFix: recommendation,
    why: whyItMatters,
    problemTitle: title,
    semanticSeverity: toSemanticSeverity(severity as Severity),
  };
}

export function issueToFinding(issue: Issue): Finding {
  const primaryLoc = issue.locations[0] || {
    filePath: issue.filePath || 'unknown',
    range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
  };

  const sourceLoc: SourceLocation = issue.location || {
    filePath: primaryLoc.filePath,
    start: { line: primaryLoc.range.startLine, column: primaryLoc.range.startColumn, offset: 0 },
    end: { line: primaryLoc.range.endLine, column: primaryLoc.range.endColumn, offset: 0 },
  };

  const findingSeverity: Severity =
    issue.severity === 'critical' ? 'blocker' :
    issue.severity === 'high' ? 'error' :
    issue.severity === 'medium' ? 'warning' :
    issue.severity === 'low' ? 'suggestion' : 'info';

  let findingStatus: 'open' | 'fixed' | 'rejected' | 'ignored' | 'stale' = 'open';
  if (issue.status === 'resolved') findingStatus = 'fixed';
  else if (issue.status === 'ignored') findingStatus = 'ignored';
  else if (issue.status === 'rejected') findingStatus = 'rejected';
  else if (issue.status === 'needs-revalidation') findingStatus = 'stale';

  return {
    id: issue.id,
    fingerprint: issue.fingerprint,
    ruleId: issue.ruleId,
    title: issue.title,
    message: issue.message || issue.title,
    summary: issue.summary,
    description: issue.summary,
    problemTitle: issue.title,
    whatIsWrong: issue.summary,
    whyItMatters: issue.whyItMatters,
    why: issue.whyItMatters,
    howToFix: issue.recommendation,
    recommendation: issue.recommendation,
    category: issue.category,
    severity: findingSeverity,
    confidence: issue.confidence,
    status: findingStatus,
    location: sourceLoc,
    primaryLocation: sourceLoc,
    filePath: primaryLoc.filePath,
    startLine: primaryLoc.range.startLine,
    endLine: primaryLoc.range.endLine,
    evidence: (Array.isArray(issue.evidence) ? issue.evidence : [])
      .filter((e): e is any => e !== null && e !== undefined)
      .map(e => ({
        type: typeof e.type === 'string' ? e.type : 'snippet',
        explanation: typeof e.message === 'string' ? e.message : '',
        snippet: typeof e.snippet === 'string' ? e.snippet : undefined,
        location: e.location ? {
          filePath: e.location.filePath,
          start: { line: e.location.range.startLine, column: e.location.range.startColumn, offset: 0 },
          end: { line: e.location.range.endLine, column: e.location.range.endColumn, offset: 0 },
        } : undefined,
      })),
    sourceSkillId: issue.skillId,
    suggestions: issue.suggestions || [],
    recommendations: issue.recommendations || [],
    fix: issue.fix,
    designFix: issue.designFix || (issue.fix && (issue.fix as any).changes ? issue.fix : undefined),
    autoFixAvailable: issue.autoFixAvailable ?? Boolean(
      (issue.fix && (issue.fix as any) !== 'manual') ||
      issue.designFix ||
      (Array.isArray(issue.suggestions) && issue.suggestions.some((s: any) => s?.safe || s?.type === 'autofix'))
    ),
    instances: issue.instances || [],
  };
}
