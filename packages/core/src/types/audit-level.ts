export type AuditLevel = 'easy' | 'moderate' | 'hard' | 'strict';

export const AUDIT_LEVEL_RANKS: Record<AuditLevel, number> = {
  easy: 1,
  moderate: 2,
  hard: 3,
  strict: 4,
};

export function isAuditLevelSufficient(configuredLevel: AuditLevel, requiredLevel: AuditLevel): boolean {
  return AUDIT_LEVEL_RANKS[configuredLevel] >= AUDIT_LEVEL_RANKS[requiredLevel];
}

export interface AuditLevelMeta {
  level: AuditLevel;
  title: string;
  description: string;
  focus: string;
}

export const AUDIT_LEVEL_METAS: Record<AuditLevel, AuditLevelMeta> = {
  easy: {
    level: 'easy',
    title: 'Easy',
    description: 'High-confidence issues only',
    focus: 'Security vulnerabilities, obvious bugs, broken accessibility, and raw crashes.',
  },
  moderate: {
    level: 'moderate',
    title: 'Moderate',
    description: 'Balanced code, UX, architecture, and accessibility review (Recommended)',
    focus: 'Unnecessary dependencies, state complexity, code duplication, patchwork patterns, and UX friction.',
  },
  hard: {
    level: 'hard',
    title: 'Hard',
    description: 'Deep quality and CraftLens design analysis',
    focus: 'Weaker architectural smells, visual genericity, template patterns, intent debt, and design-system drift.',
  },
  strict: {
    level: 'strict',
    title: 'Strict',
    description: 'Rigorous production/senior engineering review',
    focus: 'Aggressive inspection across architecture, edge cases, state machines, contracts, and fine design details.',
  },
};
