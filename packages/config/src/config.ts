import { AuditLevel, Severity } from '@anti-slop/core';

export interface RuleConfigEntry {
  enabled?: boolean;
  severity?: Severity;
  options?: Record<string, unknown>;
}

export interface AntiSlopConfig {
  enabled: boolean;
  severity: Severity;
  auditLevel: AuditLevel;
  autoAudit: boolean;
  scanOnSave: boolean;
  scanOnChange: boolean;
  enableCodeLens: boolean;
  persistAudit: boolean;
  maxDiagnosticsPerFile: number;
  rules: Record<string, RuleConfigEntry>;
  suppressions: string[];
}

export const DEFAULT_CONFIG: AntiSlopConfig = {
  enabled: true,
  severity: 'warning',
  auditLevel: 'moderate',
  autoAudit: true,
  scanOnSave: true,
  scanOnChange: true,
  enableCodeLens: true,
  persistAudit: true,
  maxDiagnosticsPerFile: 50,
  rules: {},
  suppressions: [],
};

export function mergeConfig(base: AntiSlopConfig, override: Partial<AntiSlopConfig>): AntiSlopConfig {
  return {
    ...base,
    ...override,
    rules: {
      ...base.rules,
      ...(override.rules || {}),
    },
    suppressions: [
      ...base.suppressions,
      ...(override.suppressions || []),
    ],
  };
}
