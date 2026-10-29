export type CanonicalSeverity = 'error' | 'warning' | 'moderate' | 'info';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'suggestion' | CanonicalSeverity;
export type LegacySeverity = 'blocker' | 'error' | 'warning' | 'suggestion' | 'info';
export type Severity = FindingSeverity | LegacySeverity;

export const SEVERITY_LEVELS: Record<Severity, number> = {
  critical: 5,
  blocker: 5,
  high: 4,
  error: 4,
  medium: 3,
  warning: 3,
  moderate: 3,
  low: 2,
  suggestion: 2,
  info: 1,
};

export function normalizeSeverity(severity?: string): FindingSeverity {
  const s = severity?.toLowerCase() || '';
  switch (s) {
    case 'critical':
    case 'blocker':
      return 'critical';
    case 'high':
    case 'error':
      return 'high';
    case 'medium':
    case 'warning':
    case 'moderate':
      return 'medium';
    case 'low':
    case 'info':
      return 'low';
    case 'suggestion':
    default:
      return 'suggestion';
  }
}

export function toSemanticSeverity(severity?: string): CanonicalSeverity {
  const s = severity?.toLowerCase() || '';
  switch (s) {
    case 'error':
    case 'critical':
    case 'blocker':
    case 'high':
      return 'error';
    case 'warning':
      return 'warning';
    case 'moderate':
    case 'medium':
      return 'moderate';
    case 'info':
    case 'low':
    case 'suggestion':
    default:
      return 'info';
  }
}

export const SEMANTIC_SEVERITY_MAP: Record<CanonicalSeverity, { label: string; icon: string; color: string; badge: string }> = {
  error: { label: 'Error', icon: '', color: '#ef4444', badge: 'Error' },
  warning: { label: 'Warning', icon: '', color: '#f97316', badge: 'Warning' },
  moderate: { label: 'Moderate', icon: '', color: '#ea580c', badge: 'Moderate' },
  info: { label: 'Suggestion', icon: '', color: '#eab308', badge: 'Suggestion' },
};

export function isSeverityAtLeast(current: Severity, threshold?: Severity): boolean {
  if (!threshold) return true;
  return (SEVERITY_LEVELS[current] || 0) >= (SEVERITY_LEVELS[threshold] || 0);
}


