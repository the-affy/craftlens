import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class WebviewAnalyzer implements QAAnalyzer {
  id = 'qa-webview';
  name = 'Webview Application & CSP Analyzer';
  category: QACategory = 'webview';

  async isAvailable(context: QAContext): Promise<boolean> {
    const webviewFiles = this.findWebviewFiles(context.workspaceRoot);
    return webviewFiles.length > 0;
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const webviewFiles = this.findWebviewFiles(context.workspaceRoot);

    for (const filePath of webviewFiles) {
      if (signal?.aborted) break;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // 1. Content Security Policy (CSP) Check
        if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
          const hasCsp = content.includes('http-equiv="Content-Security-Policy"') || content.includes("http-equiv='Content-Security-Policy'");
          if (!hasCsp) {
            findings.push({
              ruleId: 'WEBVIEW-MISSING-CSP',
              title: 'Webview HTML lacks Content Security Policy (CSP)',
              message: 'Webview generates full HTML document without declaring a Content Security Policy header.',
              category: 'security',
              severity: 'high',
              confidence: 0.98,
              filePath,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'security_sink',
                  description: 'No Content-Security-Policy meta tag found in HTML document template.',
                  source: this.id,
                  filePath,
                },
              ],
              inference: 'Without CSP, webview content is vulnerable to script injection and unauthorized resource loading.',
              recommendation: 'Add `<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src ...;">`.',
            });
          }

          // 2. Unsafe eval in CSP
          if (content.includes("'unsafe-eval'") || content.includes('"unsafe-eval"')) {
            findings.push({
              ruleId: 'WEBVIEW-UNSAFE-EVAL',
              title: 'Webview CSP permits `unsafe-eval`',
              message: 'Content Security Policy specifies `unsafe-eval`, permitting dynamic code evaluation in webview context.',
              category: 'security',
              severity: 'critical',
              confidence: 1.0,
              filePath,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'security_sink',
                  description: "CSP directive contains 'unsafe-eval'.",
                  source: this.id,
                  filePath,
                },
              ],
              inference: 'Attackers injecting strings could execute arbitrary JavaScript within webview origin.',
              recommendation: "Remove 'unsafe-eval' from webview CSP.",
            });
          }
        }

        // 3. Duplicate DOM IDs within HTML templates
        const idMatches = [...content.matchAll(/id=["']([a-zA-Z0-9_-]+)["']/g)];
        const seenIds = new Map<string, number>();
        for (const match of idMatches) {
          const id = match[1];
          const count = seenIds.get(id) || 0;
          seenIds.set(id, count + 1);
        }

        for (const [id, count] of seenIds.entries()) {
          // If ID occurs repeatedly in a single template (and is not an intentional selector placeholder)
          if (count > 1 && !id.includes('${') && !id.startsWith('item-')) {
            // Find line number
            let lineNum = 1;
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(`id="${id}"`) || lines[i].includes(`id='${id}'`)) {
                lineNum = i + 1;
                break;
              }
            }

            findings.push({
              ruleId: 'WEBVIEW-DUPLICATE-DOM-ID',
              title: `Duplicate DOM element ID in webview HTML: "${id}"`,
              message: `Element ID "${id}" is duplicated ${count} times in the same document template.`,
              category: 'quality',
              severity: 'medium',
              confidence: 0.92,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'ast_pattern',
                  description: `DOM ID "${id}" repeated ${count} times in template.`,
                  source: this.id,
                  filePath,
                  line: lineNum,
                },
              ],
              inference: 'Duplicate IDs break document.getElementById and cause unpredictable DOM query behavior.',
              recommendation: `Use CSS classes or distinct IDs (e.g., "${id}-container", "${id}-button").`,
            });
          }
        }

        // 4. Keyboard focus visibility (:focus-visible)
        if (content.includes('<style>') || content.includes('function getWebviewContent')) {
          if (!content.includes(':focus-visible') && !content.includes('outline:')) {
            findings.push({
              ruleId: 'WEBVIEW-A11Y-NO-FOCUS-VISIBLE',
              title: 'Webview styles lack keyboard :focus-visible outlines',
              message: 'Webview stylesheet does not provide explicit :focus-visible indicators for interactive controls.',
              category: 'accessibility',
              severity: 'low',
              confidence: 0.85,
              filePath,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'ast_pattern',
                  description: 'No :focus-visible rules detected in webview CSS.',
                  source: this.id,
                  filePath,
                },
              ],
              inference: 'Keyboard navigation users will not see which button or control currently has focus.',
              recommendation: 'Add `:focus-visible { outline: 1px solid var(--vscode-focusBorder); }` to webview CSS.',
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
      metrics: {
        webviewFilesCount: webviewFiles.length,
      },
      notes: `Webview validation checked ${webviewFiles.length} panel templates for CSP, DOM uniqueness, and accessibility.`,
    };
  }

  private findWebviewFiles(root: string): string[] {
    const candidateFiles = [
      path.join(root, 'apps', 'vscode-extension', 'src', 'overview', 'project-overview-panel.ts'),
      path.join(root, 'apps', 'vscode-extension', 'src', 'sidebar', 'sidebar-provider.ts'),
      path.join(root, 'apps', 'vscode-extension', 'src', 'sidebar', 'detail-panel-provider.ts'),
    ];
    return candidateFiles.filter(f => fs.existsSync(f));
  }
}

