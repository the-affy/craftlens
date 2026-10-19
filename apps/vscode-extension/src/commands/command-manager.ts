import * as vscode from 'vscode';
import { Finding, formatConfidencePercent } from '@anti-slop/core';
import { RuleEngine } from '@anti-slop/rule-engine';
import { DiagnosticsCollectionAdapter } from '../diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../configuration/config-manager.js';

export class CommandManager {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private engine: RuleEngine,
    private diagnosticsAdapter: DiagnosticsCollectionAdapter,
    private configManager: ConfigurationManager
  ) {
    this.registerCommands();
  }

  private registerCommands(): void {
    // 1. Scan Current File
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.scanCurrentFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('Anti-Slop: No active file open to scan.');
          return;
        }

        const doc = editor.document;
        const config = this.configManager.getConfig();
        const result = this.engine.analyze({
          filePath: doc.uri.fsPath,
          sourceText: doc.getText(),
          version: doc.version,
          config,
        });

        this.diagnosticsAdapter.update(doc.uri, result.findings);
        vscode.window.showInformationMessage(
          `Anti-Slop: Scan completed in ${result.totalTimeMs.toFixed(1)}ms. Found ${result.findings.length} issue(s).`
        );
      })
    );

    // 2. Scan Workspace
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.scanWorkspace', async () => {
        const files = await vscode.workspace.findFiles(
          '**/*.{ts,tsx,js,jsx}',
          '**/node_modules/**'
        );

        if (files.length === 0) {
          vscode.window.showInformationMessage('Anti-Slop: No supported source files found in workspace.');
          return;
        }

        let totalFindings = 0;
        const config = this.configManager.getConfig();

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Anti-Slop: Scanning Workspace',
            cancellable: true,
          },
          async (progress, token) => {
            for (let i = 0; i < files.length; i++) {
              if (token.isCancellationRequested) break;
              const fileUri = files[i];
              progress.report({
                message: `${i + 1}/${files.length} (${vscode.workspace.asRelativePath(fileUri)})`,
                increment: 100 / files.length,
              });

              try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const result = this.engine.analyze({
                  filePath: fileUri.fsPath,
                  sourceText: doc.getText(),
                  version: doc.version,
                  config,
                });
                this.diagnosticsAdapter.update(fileUri, result.findings);
                totalFindings += result.findings.length;
              } catch (e) {
                console.error(`Failed to scan ${fileUri.fsPath}:`, e);
              }
            }
          }
        );

        vscode.window.showInformationMessage(
          `Anti-Slop: Workspace scan complete. Scanned ${files.length} files, identified ${totalFindings} issue(s).`
        );
      })
    );

    // 3. Show Report
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.showReport', () => {
        const stats = this.engine.getPerformanceTracker().getStats();
        const findingsMap = this.diagnosticsAdapter.getAllFindings();
        let totalFindings = 0;
        const findingsByRule: Record<string, number> = {};

        for (const findings of findingsMap.values()) {
          totalFindings += findings.length;
          for (const f of findings) {
            findingsByRule[f.ruleId] = (findingsByRule[f.ruleId] || 0) + 1;
          }
        }

        const report = [
          '# Anti-Slop Analysis Report',
          `**Total Issues Found:** ${totalFindings}`,
          `**Files with Issues:** ${findingsMap.size}`,
          `**Cache Hit Ratio:** ${(stats.cacheHitRatio * 100).toFixed(0)}% (${stats.cacheHits} hits / ${stats.cacheMisses} misses)`,
          `**Avg Total Diagnostic Time:** ${stats.avgTotalTimeMs}ms (Parse: ${stats.avgParseTimeMs}ms, Rules: ${stats.avgRuleTimeMs}ms)`,
          '',
          '## Breakdown by Rule',
          ...Object.entries(findingsByRule).map(([rule, count]) => `- **${rule}**: ${count}`),
        ].join('\n');

        const panel = vscode.window.createWebviewPanel(
          'antiSlopReport',
          'Anti-Slop Quality Report',
          vscode.ViewColumn.Beside,
          {}
        );
        panel.webview.html = `<html><body style="font-family: system-ui, sans-serif; padding: 20px; line-height: 1.6;"><pre style="white-space: pre-wrap;">${report}</pre></body></html>`;
      })
    );

    // 4. Explain Finding
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.explainFinding', (finding?: Finding) => {
        if (!finding) {
          vscode.window.showInformationMessage('Anti-Slop: No finding selected to explain.');
          return;
        }

        const evidenceLines = finding.evidence.map(
          e => `• **${e.type.toUpperCase()}**: ${e.explanation}${e.snippet ? `\n  \`${e.snippet}\`` : ''}`
        ).join('\n');

        const message = [
          `### [${finding.ruleId}] ${finding.message}`,
          `**Confidence:** ${formatConfidencePercent(finding.confidence)} | **Severity:** ${finding.severity.toUpperCase()}`,
          '',
          `**Why it matters:** ${finding.description}`,
          '',
          `**Evidence:**\n${evidenceLines}`,
          '',
          finding.recommendation ? `**Recommendation:** ${finding.recommendation}` : '',
        ].filter(Boolean).join('\n');

        vscode.window.showInformationMessage(`[${finding.ruleId}] ${finding.message}: ${finding.recommendation || finding.description}`);
      })
    );

    // 5. Ignore Rule
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.ignoreRule', async () => {
        const rules = this.engine.getRegistry().getAllRules();
        const pick = await vscode.window.showQuickPick(
          rules.map(r => ({
            label: r.id,
            description: r.title,
            detail: r.description,
          })),
          { placeHolder: 'Select a rule to disable in workspace settings' }
        );

        if (pick) {
          await this.configManager.setRuleEnabled(pick.label, false);
          vscode.window.showInformationMessage(`Anti-Slop: Rule '${pick.label}' has been disabled.`);
        }
      })
    );

    // 6. Reset Suppressions
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.resetSuppressions', async () => {
        const vsConfig = vscode.workspace.getConfiguration('antiSlop');
        await vsConfig.update('suppressions', [], vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage('Anti-Slop: Workspace suppressions reset.');
      })
    );
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
