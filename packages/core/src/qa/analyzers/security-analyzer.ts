import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class SecurityAnalyzer implements QAAnalyzer {
  id = 'qa-security';
  name = 'Deep Security & Vulnerability Analyzer';
  category: QACategory = 'security';

  async isAvailable(context: QAContext): Promise<boolean> {
    return true;
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const filesToScan = this.collectSourceFiles(root, context.changedFiles);

    // Secret Patterns
    const secretPatterns: { name: string; regex: RegExp; ruleId: string }[] = [
      { name: 'OpenAI Secret Key', regex: /\bsk-(?:proj-)?[a-zA-Z0-9_-]{20,}\b/, ruleId: 'SEC-SECRET-OPENAI' },
      { name: 'GitHub Personal Access Token', regex: /\bghp_[a-zA-Z0-9]{36}\b/, ruleId: 'SEC-SECRET-GITHUB' },
      { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/, ruleId: 'SEC-SECRET-AWS' },
      { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z-_]{35}\b/, ruleId: 'SEC-SECRET-GOOGLE' },
      { name: 'Private Cryptographic Key', regex: /-----BEGIN (?:RSA|EC|OPENSSH|PGP) PRIVATE KEY-----/, ruleId: 'SEC-SECRET-PRIVKEY' },
      { name: 'Hardcoded Password Assignment', regex: /(?:password|passwd|secret)\s*[:=]\s*['"][^'"]{6,}['"]/i, ruleId: 'SEC-SECRET-PASSWORD' },
    ];

    for (const filePath of filesToScan) {
      if (signal?.aborted) break;

      const normPath = filePath.split(path.sep).join('/');
      const isTestFile = normPath.includes('/tests/') || normPath.endsWith('.test.ts');
      const isFixture = normPath.includes('/fixtures/') || normPath.includes('qa-fixtures/');

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          // 1. Scan for Secrets (skip harmless test mock files unless in qa-fixtures/security)
          if (!isTestFile || normPath.includes('qa-fixtures/security')) {
            for (const sp of secretPatterns) {
              if (sp.regex.test(line)) {
                // Ignore obvious test placeholders like 'password: "mock-password"' in tests
                if (isTestFile && (line.includes('mock') || line.includes('test') || line.includes('fake'))) {
                  continue;
                }

                findings.push({
                  ruleId: sp.ruleId,
                  title: `Exposed sensitive credential: ${sp.name}`,
                  message: `Detected pattern matching ${sp.name} in source code.`,
                  category: 'security',
                  severity: 'critical',
                  confidence: 0.96,
                  filePath,
                  startLine: lineNum,
                  sourceAnalyzer: this.id,
                  evidence: [
                    {
                      type: 'security_sink',
                      description: `Pattern match for ${sp.name}`,
                      source: this.id,
                      filePath,
                      line: lineNum,
                      snippet: this.maskSecret(line.trim()),
                    },
                  ],
                  inference: 'Committed secrets in repositories can be harvested and used for unauthorized access.',
                  recommendation: 'Remove credential immediately, rotate the compromised key, and load from environment variables.',
                });
              }
            }
          }

          // 2. Command Injection & Unsafe Process Execution
          // e.g. child_process.exec(`... ${var} ...`) or execSync(`...` + var)
          const execMatch = /(?:child_process\.)?(?:exec|execSync)\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/.exec(line);
          const execConcatMatch = /(?:child_process\.)?(?:exec|execSync)\s*\(\s*[^,)]+\s*\+\s*[^,)]+/.exec(line);

          if ((execMatch || execConcatMatch) && !isTestFile) {
            findings.push({
              ruleId: 'SEC-COMMAND-INJECTION',
              title: 'Command Injection risk via dynamic shell execution',
              message: 'Invoking shell command with string interpolation or concatenation.',
              category: 'security',
              severity: 'critical',
              confidence: 0.94,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'security_sink',
                  description: `Dynamic shell execution: ${execMatch ? execMatch[0] : execConcatMatch?.[0]}`,
                  source: this.id,
                  filePath,
                  line: lineNum,
                  snippet: line.trim(),
                },
              ],
              inference: 'Attacker-controlled input included in the command string enables arbitrary code execution.',
              recommendation: 'Use `execFile` or `spawn` with an arguments array rather than executing a dynamic shell string.',
            });
          }

          // 3. Unsafe Webview innerHTML Assignment
          if (line.includes('.innerHTML =') && !isTestFile) {
            const isEscaped = line.includes('escapeHtml(') || line.includes('sanitize(') || line.includes('JSON.stringify(');
            if (!isEscaped) {
              findings.push({
                ruleId: 'SEC-WEBVIEW-HTML-INJECTION',
                title: 'Potential Cross-Site Scripting (XSS) via unescaped innerHTML',
                message: 'Assigning dynamic string directly to innerHTML without sanitization or HTML escaping.',
                category: 'security',
                severity: 'high',
                confidence: 0.88,
                filePath,
                startLine: lineNum,
                sourceAnalyzer: this.id,
                evidence: [
                  {
                    type: 'security_sink',
                    description: 'Direct innerHTML assignment without escaping.',
                    source: this.id,
                    filePath,
                    line: lineNum,
                    snippet: line.trim(),
                  },
                ],
                inference: 'Unsanitized input rendered via innerHTML allows arbitrary script execution within the webview.',
                recommendation: 'Use textContent, safe DOM APIs, or an HTML escape function before assigning HTML.',
              });
            }
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
        filesAudited: filesToScan.length,
        vulnerabilitiesDetected: findings.length,
      },
      notes: `Security analysis completed across ${filesToScan.length} files. Checked secrets, shell injection, and HTML injection.`,
    };
  }

  private maskSecret(line: string): string {
    return line.replace(/(sk-[a-zA-Z0-9]{6})[a-zA-Z0-9]+/g, '$1***')
      .replace(/(ghp_[a-zA-Z0-9]{4})[a-zA-Z0-9]+/g, '$1***')
      .replace(/(AKIA[0-9A-Z]{4})[0-9A-Z]+/g, '$1***')
      .replace(/(AIza[0-9A-Za-z-_]{6})[0-9A-Za-z-_]+/g, '$1***');
  }

  private collectSourceFiles(root: string, changedFiles?: string[]): string[] {
    if (changedFiles && changedFiles.length > 0) {
      return changedFiles
        .map(f => path.isAbsolute(f) ? f : path.resolve(root, f))
        .filter(f => fs.existsSync(f));
    }

    const results: string[] = [];
    const dirs = ['packages', 'apps', 'src', 'scripts', 'qa-fixtures'];
    for (const d of dirs) {
      const full = path.join(root, d);
      if (fs.existsSync(full)) {
        this.walk(full, results);
      }
    }
    return results;
  }

  private walk(dir: string, results: string[]): void {
    if (dir.includes('node_modules') || dir.includes('dist') || dir.includes('.git')) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.walk(full, results);
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json|md|html)$/.test(entry.name)) {
          results.push(full);
        }
      }
    } catch {
      // ignore
    }
  }
}
