import * as vscode from 'vscode';
import { CraftLensConfig, DEFAULT_CONFIG } from '@craftlens/config';
import { AuditLevel, Severity, AuditStorageManager } from '@craftlens/core';

export class ConfigurationManager {
  private currentConfig: CraftLensConfig = { ...DEFAULT_CONFIG };
  private onDidChangeEmitter = new vscode.EventEmitter<CraftLensConfig>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private storageManager?: AuditStorageManager) {
    this.reload();
  }

  public setStorageManager(storageManager: AuditStorageManager): void {
    this.storageManager = storageManager;
    this.reload();
  }

  public getConfig(): CraftLensConfig {
    return this.currentConfig;
  }

  public reload(): void {
    const craftConfig = vscode.workspace.getConfiguration('craftlens');
    const projectConfig = this.storageManager?.loadProjectConfig();
    const diskSuppressions = this.storageManager?.loadSuppressions() || [];

    const getVal = <T>(key: string, def: T): T => {
      if (typeof craftConfig?.inspect === 'function') {
        const inspected = craftConfig.inspect<T>(key);
        if (inspected && (inspected.globalValue !== undefined || inspected.workspaceValue !== undefined || inspected.workspaceFolderValue !== undefined)) {
          return craftConfig.get<T>(key, def);
        }
      }
      if (craftConfig && typeof craftConfig.get === 'function') {
        return craftConfig.get<T>(key, def);
      }
      return def;
    };

    const autoAudit = projectConfig && typeof projectConfig.autoAudit === 'boolean'
      ? projectConfig.autoAudit
      : getVal<boolean>('autoAudit', true);

    const auditLevel = projectConfig && typeof projectConfig.defaultAuditLevel === 'string'
      ? (projectConfig.defaultAuditLevel as AuditLevel)
      : getVal<AuditLevel>('auditLevel', 'moderate');

    const configSuppressions = getVal<string[]>('suppressions', []);
    const mergedSuppressions = Array.from(new Set([...configSuppressions, ...diskSuppressions]));

    this.currentConfig = {
      enabled: getVal<boolean>('enabled', true),
      severity: getVal<Severity>('severity', 'warning'),
      auditLevel,
      defaultAuditLevel: auditLevel,
      ruleExecutionMode: getVal<any>('ruleExecutionMode', 'combined'),
      autoAudit,
      scanOnSave: getVal<boolean>('scanOnSave', true),
      scanOnChange: getVal<boolean>('scanOnChange', true),
      enableCodeLens: getVal<boolean>('enableCodeLens', true),
      persistAudit: getVal<boolean>('persistAudit', true),
      maxDiagnosticsPerFile: getVal<number>('maxDiagnosticsPerFile', 50),
      rules: getVal<Record<string, any>>('rules', {}),
      skills: getVal<Record<string, any>>('skills', {}),
      skillOverrides: getVal<Record<string, any>>('skillOverrides', {}),
      userOverrides: getVal<Record<string, any>>('userOverrides', {}),
      suppressions: mergedSuppressions,
    };
    this.onDidChangeEmitter.fire(this.currentConfig);
  }

  public async setRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
    const craftConfig = vscode.workspace.getConfiguration('craftlens');
    const existingRules = (craftConfig?.get && craftConfig.get<Record<string, any>>('rules')) || {};
    const updated = {
      ...existingRules,
      [ruleId]: {
        ...(existingRules[ruleId] || {}),
        enabled,
      },
    };
    if (craftConfig?.update) {
      try {
        await craftConfig.update('rules', updated, vscode.ConfigurationTarget.Workspace);
      } catch {
        // fallback
      }
    }

    if (!enabled && this.storageManager) {
      this.storageManager.addSuppression(ruleId);
    }

    this.reload();
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
