import { AuditLevel, Severity, RuleExecutionMode, SkillMode, RuleOverride } from '@craftlens/core';

export interface RuleConfigEntry {
  enabled?: boolean;
  severity?: Severity;
  options?: Record<string, unknown>;
}

export interface SkillConfigEntry {
  enabled?: boolean;
  mode?: SkillMode;
  version?: string;
}

export interface CraftLensConfig {
  enabled: boolean;
  severity: Severity;
  auditLevel: AuditLevel;
  defaultAuditLevel?: AuditLevel;
  ruleExecutionMode: RuleExecutionMode;
  autoAudit: boolean;
  scanOnSave: boolean;
  scanOnChange: boolean;
  enableCodeLens: boolean;
  persistAudit: boolean;
  maxDiagnosticsPerFile: number;
  rules: Record<string, RuleConfigEntry>;
  skills: Record<string, string>;
  skillOverrides: Record<string, SkillConfigEntry>;
  userOverrides: Record<string, RuleOverride>;
  suppressions: string[];
}

export const DEFAULT_CONFIG: CraftLensConfig = {
  enabled: true,
  severity: 'warning',
  auditLevel: 'moderate',
  defaultAuditLevel: 'moderate',
  ruleExecutionMode: 'combined',
  autoAudit: true,
  scanOnSave: true,
  scanOnChange: true,
  enableCodeLens: true,
  persistAudit: true,
  maxDiagnosticsPerFile: 50,
  rules: {},
  skills: {},
  skillOverrides: {},
  userOverrides: {},
  suppressions: [],
};

export function mergeConfig(base: CraftLensConfig, override: Partial<CraftLensConfig>): CraftLensConfig {
  return {
    ...base,
    ...override,
    rules: {
      ...base.rules,
      ...(override.rules || {}),
    },
    skills: {
      ...base.skills,
      ...(override.skills || {}),
    },
    skillOverrides: {
      ...base.skillOverrides,
      ...(override.skillOverrides || {}),
    },
    userOverrides: {
      ...base.userOverrides,
      ...(override.userOverrides || {}),
    },
    suppressions: [
      ...base.suppressions,
      ...(override.suppressions || []),
    ],
  };
}
