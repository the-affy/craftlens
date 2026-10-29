import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class CodeQualityAnalyzer implements QAAnalyzer {
  id = 'qa-code-quality';
  name = 'Engineering Code Quality & Bug Analyzer';
  category: QACategory = 'code-quality';

  async isAvailable(context: QAContext): Promise<boolean> {
    return true;
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const filesToScan = this.collectSourceFiles(root, context.changedFiles);

    for (const filePath of filesToScan) {
      if (signal?.aborted) break;

      const normPath = filePath.split(path.sep).join('/');
      const isTestFile = normPath.includes('/tests/') || normPath.endsWith('.test.ts');

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          // 1. Silent Exception Swallowing: catch block completely empty
          // e.g. } catch (err) {} or } catch {}
          if (/}\s*catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(line) && !isTestFile) {
            findings.push({
              ruleId: 'CQ-EXCEPTION-SWALLOWING',
              title: 'Silent exception swallowing in empty catch block',
              message: 'Exceptions are silently discarded without logging or handling.',
              category: 'quality',
              severity: 'medium',
              confidence: 0.95,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'ast_pattern',
                  description: 'Empty catch block suppresses all errors.',
                  source: this.id,
                  filePath,
                  line: lineNum,
                  snippet: line.trim(),
                },
              ],
              inference: 'Silently swallowed errors hide failures, leading to corrupt internal state and untraceable bugs.',
              recommendation: 'Log the error with console.error or diagnostic logger, or re-throw a domain error.',
            });
          }

          // 2. NaN comparison bug: x === NaN is always false in JS
          if (/(?:===|==|!==|!=)\s*NaN\b|\bNaN\s*(?:===|==|!==|!=)/.test(line)) {
            findings.push({
              ruleId: 'CQ-NAN-COMPARISON',
              title: 'Invalid comparison with NaN',
              message: 'Comparing directly with `NaN` is always false/true because `NaN !== NaN`.',
              category: 'quality',
              severity: 'high',
              confidence: 0.98,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'ast_pattern',
                  description: 'Direct comparison with NaN identifier.',
                  source: this.id,
                  filePath,
                  line: lineNum,
                  snippet: line.trim(),
                },
              ],
              inference: 'The branch condition will never behave as intended.',
              recommendation: 'Use `Number.isNaN(value)` or `isNaN(value)` instead.',
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
        filesChecked: filesToScan.length,
        qualityIssuesCount: findings.length,
      },
      notes: `Code quality inspection scanned ${filesToScan.length} files for bug patterns and exception handling.`,
    };
  }

  private collectSourceFiles(root: string, changedFiles?: string[]): string[] {
    if (changedFiles && changedFiles.length > 0) {
      return changedFiles
        .map(f => path.isAbsolute(f) ? f : path.resolve(root, f))
        .filter(f => fs.existsSync(f) && (f.endsWith('.ts') || f.endsWith('.js')));
    }

    const results: string[] = [];
    const dirs = ['packages', 'apps'];
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
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          results.push(full);
        }
      }
    } catch {
      // ignore
    }
  }
}

