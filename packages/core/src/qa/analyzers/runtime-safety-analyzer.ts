import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class RuntimeSafetyAnalyzer implements QAAnalyzer {
  id = 'qa-runtime-safety';
  name = 'Runtime Safety & Lifecycle Analyzer';
  category: QACategory = 'runtime';

  async isAvailable(context: QAContext): Promise<boolean> {
    const extDir = path.join(context.workspaceRoot, 'apps', 'vscode-extension', 'src');
    return fs.existsSync(extDir);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const filesToScan = this.collectSourceFiles(root, context.changedFiles);

    for (const filePath of filesToScan) {
      if (signal?.aborted) break;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          // 1. Undisposed Timers: setInterval without assignment or clear
          if (line.includes('setInterval(') && !line.includes('const ') && !line.includes('let ') && !line.includes('this.') && !line.includes('clearInterval')) {
            findings.push({
              ruleId: 'RUNTIME-UNDISPOSED-TIMER',
              title: 'Undisposed setInterval timer leak',
              message: '`setInterval` is called without retaining the timer handle for disposal.',
              category: 'quality',
              severity: 'medium',
              confidence: 0.90,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'runtime_leak',
                  description: 'setInterval handle discarded without disposal tracking.',
                  source: this.id,
                  filePath,
                  line: lineNum,
                  snippet: line.trim(),
                },
              ],
              inference: 'Timer will run indefinitely in extension host even after view or task completes, consuming CPU and memory.',
              recommendation: 'Store timer handle in a class variable and invoke `clearInterval(timer)` in `dispose()`.',
            });
          }

          // 2. Disposed Webview Access: accessing webview.postMessage without checking disposal
          if (line.includes('.webview.postMessage(')) {
            // Check preceding 5 lines for isDisposed or panel null check
            const startCheck = Math.max(0, i - 5);
            const contextLines = lines.slice(startCheck, i).join('\n');
            const hasDisposedGuard =
              contextLines.includes('if (!this.panel') ||
              contextLines.includes('if (this.panel') ||
              contextLines.includes('if (!this._panel') ||
              contextLines.includes('if (this._panel') ||
              contextLines.includes('isDisposed') ||
              contextLines.includes('if (!panel') ||
              contextLines.includes('if (panel') ||
              line.includes('?.webview');

            if (!hasDisposedGuard && !filePath.includes('test')) {
              findings.push({
                ruleId: 'RUNTIME-DISPOSED-WEBVIEW-ACCESS',
                title: 'Potential message dispatch to disposed webview',
                message: 'Dispatching message to webview without verifying panel is active and not disposed.',
                category: 'quality',
                severity: 'medium',
                confidence: 0.85,
                filePath,
                startLine: lineNum,
                sourceAnalyzer: this.id,
                evidence: [
                  {
                    type: 'runtime_leak',
                    description: 'Direct call to webview.postMessage without prior null/disposed guard.',
                    source: this.id,
                    filePath,
                    line: lineNum,
                    snippet: line.trim(),
                  },
                ],
                inference: 'Calling postMessage after a user closes an editor panel will throw unhandled exception.',
                recommendation: 'Guard postMessage with `if (this.panel && !this.isDisposed)` or optional chaining.',
              });
            }
          }

          // 3. Undisposed Event Subscriptions: onDid... not pushed to subscriptions or disposables
          if (
            (line.includes('vscode.workspace.onDidChange') ||
              line.includes('vscode.window.onDidChange') ||
              line.includes('vscode.workspace.onDidSaveTextDocument')) &&
            !line.includes('subscriptions.push') &&
            !line.includes('disposables.push') &&
            !line.includes('this.disposables.push') &&
            !line.includes('context.subscriptions.push') &&
            !line.includes('return ') &&
            !filePath.includes('test')
          ) {
            findings.push({
              ruleId: 'RUNTIME-UNDISPOSED-LISTENER',
              title: 'Undisposed VS Code event subscription leak',
              message: 'VS Code event listener registered without pushing disposable to extension context.',
              category: 'quality',
              severity: 'high',
              confidence: 0.88,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'runtime_leak',
                  description: 'Event subscription returned Disposable is not registered for disposal.',
                  source: this.id,
                  filePath,
                  line: lineNum,
                  snippet: line.trim(),
                },
              ],
              inference: 'Leaked listener stays alive across reload or reconfiguration, executing duplicate callbacks.',
              recommendation: 'Push subscription to `context.subscriptions.push(...)` or `this.disposables.push(...)`.',
            });
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: findings.some(f => f.severity === 'critical') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      findings,
      notes: `Runtime safety scan completed. Checked timers, webview lifecycle, and event disposals.`,
    };
  }

  private collectSourceFiles(root: string, changedFiles?: string[]): string[] {
    if (changedFiles && changedFiles.length > 0) {
      return changedFiles
        .map(f => path.isAbsolute(f) ? f : path.resolve(root, f))
        .filter(f => fs.existsSync(f) && (f.endsWith('.ts') || f.endsWith('.js')));
    }

    const results: string[] = [];
    const extDir = path.join(root, 'apps', 'vscode-extension', 'src');
    if (fs.existsSync(extDir)) {
      this.walk(extDir, results);
    }
    return results;
  }

  private walk(dir: string, results: string[]): void {
    if (dir.includes('node_modules') || dir.includes('dist')) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.walk(full, results);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          results.push(full);
        }
      }
    } catch {
      // ignore
    }
  }
}

