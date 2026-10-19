export type Severity = 'blocker' | 'error' | 'warning' | 'suggestion' | 'info';

export const SEVERITY_LEVELS: Record<Severity, number> = {
  blocker: 5,
  error: 4,
  warning: 3,
  suggestion: 2,
  info: 1,
};

export function isSeverityAtLeast(current: Severity, threshold: Severity): boolean {
  return SEVERITY_LEVELS[current] >= SEVERITY_LEVELS[threshold];
}
