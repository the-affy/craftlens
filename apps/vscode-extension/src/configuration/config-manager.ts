import * as vscode from 'vscode';
import { AntiSlopConfig, DEFAULT_CONFIG } from '@anti-slop/config';
import { AuditLevel, Severity } from '@anti-slop/core';

export class ConfigurationManager {
  private currentConfig: AntiSlopConfig = { ...DEFAULT_CONFIG };
  private onDidChangeEmitter = new vscode.EventEmitter<AntiSlopConfig>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  constructor() {
    this.reload();
  }

  public getConfig(): AntiSlopConfig {
    return this.currentConfig;
  }

  public reload(): void {
    const vsConfig = vscode.workspace.getConfiguration('antiSlop');
    this.currentConfig = {
      enabled: vsConfig.get<boolean>('enabled', true),
      severity: vsConfig.get<Severity>('severity', 'warning'),
      auditLevel: vsConfig.get<AuditLevel>('auditLevel', 'moderate'),
      autoAudit: vsConfig.get<boolean>('autoAudit', true),
      scanOnSave: vsConfig.get<boolean>('scanOnSave', true),
      scanOnChange: vsConfig.get<boolean>('scanOnChange', true),
      enableCodeLens: vsConfig.get<boolean>('enableCodeLens', true),
      persistAudit: vsConfig.get<boolean>('persistAudit', true),
      maxDiagnosticsPerFile: vsConfig.get<number>('maxDiagnosticsPerFile', 50),
      rules: vsConfig.get<Record<string, any>>('rules', {}),
      suppressions: vsConfig.get<string[]>('suppressions', []),
    };
    this.onDidChangeEmitter.fire(this.currentConfig);
  }

  public async setRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
    const vsConfig = vscode.workspace.getConfiguration('antiSlop');
    const existingRules = vsConfig.get<Record<string, any>>('rules', {});
    const updated = {
      ...existingRules,
      [ruleId]: {
        ...(existingRules[ruleId] || {}),
        enabled,
      },
    };
    await vsConfig.update('rules', updated, vscode.ConfigurationTarget.Workspace);
    this.reload();
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
