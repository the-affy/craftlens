import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  AuditLevel,
  AuditStorageManager,
  Finding,
  ProjectContext,
  formatConfidencePercent,
} from '@anti-slop/core';
import { RuleEngine } from '@anti-slop/rule-engine';
import { DiagnosticsCollectionAdapter, mapLocationToVsCodeRange } from '../diagnostics/collection-adapter.js';
import { ConfigurationManager } from '../configuration/config-manager.js';
import { AntiSlopStatusBar } from '../status/status-bar.js';

export class CommandManager {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private engine: RuleEngine,
    private diagnosticsAdapter: DiagnosticsCollectionAdapter,
    private configManager: ConfigurationManager,
    private storageManager: AuditStorageManager,
    private statusBar: AntiSlopStatusBar,
    private projectContext: ProjectContext
  ) {
    this.registerCommands();
  }

  private registerCommands(): void {
    // 1. Run Audit with 4 Levels (Easy, Moderate, Hard, Strict)
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.runAudit', async () => {
        // Step 1: Select Audit Level
        const levelPick = await vscode.window.showQuickPick(
          [
            {
              label: 'Moderate',
              description: 'Recommended: Balanced code, UX, architecture and accessibility review',
              detail: 'Detects code duplication, unnecessary dependencies, patchwork patterns, and UX problems.',
              level: 'moderate' as AuditLevel,
            },
            {
              label: 'Easy',
              description: 'High-confidence issues only',
              detail: 'Focuses strictly on critical bugs, exposed secrets, broken functionality, and raw crashes.',
              level: 'easy' as AuditLevel,
            },
            {
              label: 'Hard',
              description: 'Deep quality and anti-slop analysis',
              detail: 'Inspects weaker architectural smells, visual genericity, template patterns, and intent debt.',
              level: 'hard' as AuditLevel,
            },
            {
              label: 'Strict',
              description: 'Rigorous production / senior engineering review',
              detail: 'Exhaustive inspection across contracts, edge cases, state machines, and fine design details.',
              level: 'strict' as AuditLevel,
            },
          ],
          { placeHolder: 'Select Audit Intensity Level' }
        );

        if (!levelPick) return;

        // Step 2: Select Scope
        const scopePick = await vscode.window.showQuickPick(
          [
            { label: 'Entire Workspace', scope: 'workspace' },
            { label: 'Current File', scope: 'file' },
          ],
          { placeHolder: 'Select Audit Scope' }
        );

        if (!scopePick) return;

        const auditConfig = {
          ...this.configManager.getConfig(),
          auditLevel: levelPick.level,
        };

        let filesToScan: vscode.Uri[] = [];
        if (scopePick.scope === 'file') {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showInformationMessage('Anti-Slop: No active file open to audit.');
            return;
          }
          filesToScan = [editor.document.uri];
        } else {
          filesToScan = await vscode.workspace.findFiles(
            '**/*.{ts,tsx,js,jsx}',
            '**/node_modules/**'
          );
        }

        let totalFindings = 0;
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Anti-Slop: Running ${levelPick.label} Audit`,
            cancellable: true,
          },
          async (progress, token) => {
            for (let i = 0; i < filesToScan.length; i++) {
              if (token.isCancellationRequested) break;
              const fileUri = filesToScan[i];
              progress.report({
                message: `${i + 1}/${filesToScan.length} (${vscode.workspace.asRelativePath(fileUri)})`,
                increment: 100 / filesToScan.length,
              });

              try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const result = this.engine.analyze({
                  filePath: fileUri.fsPath,
                  sourceText: doc.getText(),
                  version: doc.version,
                  config: auditConfig,
                  projectContext: this.projectContext,
                });
                this.diagnosticsAdapter.update(fileUri, result.findings);
                totalFindings += result.findings.length;
              } catch (e) {
                console.error(`Audit failed for ${fileUri.fsPath}:`, e);
              }
            }
          }
        );

        // Update persistent master audit checklist
        const allFindings: Finding[] = [];
        for (const list of this.diagnosticsAdapter.getAllFindings().values()) {
          allFindings.push(...list);
        }

        const { checklist, historyEntry } = this.storageManager.syncAudit(
          this.projectContext,
          allFindings,
          levelPick.level
        );

        this.statusBar.updateFromChecklist(checklist);

        const openBtn = 'Open Master Checklist';
        const choice = await vscode.window.showInformationMessage(
          `Anti-Slop ${levelPick.label} Audit complete! Health: ${checklist.summary.healthScore}%. Found ${totalFindings} issue(s).`,
          openBtn
        );

        if (choice === openBtn) {
          vscode.commands.executeCommand('antiSlop.openMasterChecklist');
        }
      })
    );

    // 2. Open Master Checklist (.antislop/checklist.md)
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.openMasterChecklist', async () => {
        const checklistPath = path.join(this.storageManager.getDirectory(), 'checklist.md');
        this.storageManager.ensureDir();

        // If file doesn't exist yet, run a sync first
        if (!vscode.workspace.fs.stat(vscode.Uri.file(checklistPath)).then(() => true, () => false)) {
          const allFindings: Finding[] = [];
          for (const list of this.diagnosticsAdapter.getAllFindings().values()) {
            allFindings.push(...list);
          }
          this.storageManager.syncAudit(this.projectContext, allFindings, this.configManager.getConfig().auditLevel);
        }

        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(checklistPath));
          await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
        } catch (e) {
          vscode.window.showErrorMessage(`Failed to open checklist: ${e}`);
        }
      })
    );

    // 3. Apply Quick Fix Helper (Used by CodeLens)
    this.disposables.push(
      vscode.commands.registerCommand('antiSlop.applyQuickFix', async (uri: vscode.Uri, finding: Finding) => {
        if (!finding.fix || finding.fix.changes.length === 0) return;

        const edit = new vscode.WorkspaceEdit();
        for (const change of finding.fix.changes) {
          const range = mapLocationToVsCodeRange(change.range);
          edit.replace(uri, range, change.newText);
        }

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
          vscode.window.showInformationMessage(`Anti-Slop: Applied fix "${finding.fix.title}".`);
        }
      })
    );

    // 4. Scan Current File
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
          projectContext: this.projectContext,
        });

        this.diagnosticsAdapter.update(doc.uri, result.findings);
        vscode.window.showInformationMessage(
          `Anti-Slop: Scan completed in ${result.totalTimeMs.toFixed(1)}ms. Found ${result.findings.length} issue(s).`
        );
      })
    );

    // 5. Scan Workspace
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
                  projectContext: this.projectContext,
                });
                this.diagnosticsAdapter.update(fileUri, result.findings);
                totalFindings += result.findings.length;
              } catch (e) {
                console.error(`Failed to scan ${fileUri.fsPath}:`, e);
              }
            }
          }
        );

        // Sync audit checklist
        const allFindings: Finding[] = [];
        for (const list of this.diagnosticsAdapter.getAllFindings().values()) {
          allFindings.push(...list);
        }
        const { checklist } = this.storageManager.syncAudit(this.projectContext, allFindings, config.auditLevel);
        this.statusBar.updateFromChecklist(checklist);

        vscode.window.showInformationMessage(
          `Anti-Slop: Workspace scan complete. Scanned ${files.length} files, identified ${totalFindings} issue(s).`
        );
      })
    );

    // 6. Show Report
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
          '# Anti-Slop Continuous Quality Report',
          `**Total Issues Found:** ${totalFindings}`,
          `**Files with Issues:** ${findingsMap.size}`,
          `**Cache Hit Ratio:** ${(stats.cacheHitRatio * 100).toFixed(0)}% (${stats.cacheHits} hits / ${stats.cacheMisses} misses)`,
          `**Avg Diagnostic Time:** ${stats.avgTotalTimeMs}ms (Parse: ${stats.avgParseTimeMs}ms, Rules: ${stats.avgRuleTimeMs}ms)`,
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

    // 7. Explain Finding
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

    // 8. Ignore Rule
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

    // 9. Reset Suppressions
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
