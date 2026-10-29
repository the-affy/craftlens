import { IssueLocation, IssueEvidence, IssueCategory } from '../types/issue.js';

export interface FingerprintParams {
  ruleId: string;
  category?: string;
  filePath?: string;
  symbol?: string;
  evidence?: any[] | IssueEvidence[];
  codeSnippet?: string;
  location?: IssueLocation | any;
  workspaceRoot?: string;
}

/**
 * Normalizes a file path so fingerprints are consistent across absolute paths,
 * relative paths, and operating system separator differences.
 */
export function normalizeIssueFilePath(filePath?: string, workspaceRoot?: string): string {
  if (!filePath || filePath === 'unknown') return 'unknown';

  let normalized = filePath.replace(/\\/g, '/');
  if (workspaceRoot) {
    const normRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized.startsWith(normRoot)) {
      normalized = normalized.slice(normRoot.length);
    }
  }

  // Remove leading slashes and drive letters if relative
  normalized = normalized.replace(/^\/+/, '');
  return normalized.toLowerCase();
}

/**
 * Normalizes evidence items by stripping line numbers and collapsing whitespace
 * so line shifts don't invalidate the evidence string.
 */
export function normalizeEvidenceTokens(evidence?: any[]): string {
  if (!Array.isArray(evidence) || evidence.length === 0) return '';

  return evidence
    .filter((e): e is any => e !== null && e !== undefined)
    .map(e => {
      if (typeof e === 'string') {
        return e.trim().replace(/\s+/g, ' ');
      }
      const typeStr = typeof e.type === 'string' ? e.type : 'evidence';
      const text =
        typeof e.snippet === 'string'
          ? e.snippet
          : typeof e.explanation === 'string'
            ? e.explanation
            : typeof e.message === 'string'
              ? e.message
              : '';
      // Strip line number references like (line 42) or :42:
      const sanitized = text.replace(/(?::\d+:\d+|\(line\s+\d+\)|line\s+\d+)/gi, '');
      return `${typeStr}:${sanitized.trim().replace(/\s+/g, ' ')}`;
    })
    .filter(Boolean)
    .join('|');
}

/**
 * Deterministic 32-bit FNV-1a hash algorithm.
 */
export function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Computes a stable issue fingerprint that does NOT rely on line numbers.
 * The same issue shifting from line 42 to 51 retains the same fingerprint.
 */
export function computeStableIssueFingerprint(params: FingerprintParams): string {
  const ruleId = (params.ruleId || 'UNKNOWN').toUpperCase().trim();
  const category = (params.category || 'quality').toLowerCase().trim();
  const rawPath = params.filePath || params.location?.filePath || 'unknown';
  const normFilePath = normalizeIssueFilePath(rawPath, params.workspaceRoot);

  const symbol = (params.symbol || params.location?.symbol || '').trim();
  const normEvidence = normalizeEvidenceTokens(params.evidence);

  const snippet = (params.codeSnippet || params.location?.snippet || '')
    .trim()
    .replace(/\s+/g, ' ');

  // Base token string: excludes line and column numbers completely
  const contextParts = [
    `rule:${ruleId}`,
    `cat:${category}`,
    `file:${normFilePath}`,
  ];

  if (symbol) {
    contextParts.push(`sym:${symbol}`);
  }

  if (snippet) {
    contextParts.push(`snip:${snippet}`);
  }

  if (normEvidence) {
    contextParts.push(`ev:${normEvidence}`);
  }

  const baseString = contextParts.join('::');
  const hash = fnv1aHash(baseString);

  return `issue_${ruleId}_${hash}`;
}

/**
 * Computes a structural fingerprint solely from rule, normalized file, and symbol/evidence.
 * Used for detecting when an issue has moved or when code around it has changed slightly.
 */
export function computeStructuralIssueFingerprint(params: FingerprintParams): string {
  const ruleId = (params.ruleId || 'UNKNOWN').toUpperCase().trim();
  const rawPath = params.filePath || params.location?.filePath || 'unknown';
  const normFilePath = normalizeIssueFilePath(rawPath, params.workspaceRoot);
  const symbol = (params.symbol || params.location?.symbol || '').trim();
  const normEvidence = normalizeEvidenceTokens(params.evidence);

  const baseString = `struct::${ruleId}::${normFilePath}::${symbol}::${normEvidence}`;
  const hash = fnv1aHash(baseString);

  return `struct_${ruleId}_${hash}`;
}
