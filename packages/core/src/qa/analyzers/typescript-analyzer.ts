import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class TypeScriptAnalyzer implements QAAnalyzer {
  id = 'qa-typescript';
  name = 'TypeScript & Static Safety Analyzer';
  category: QACategory = 'correctness';

  async isAvailable(context: QAContext): Promise<boolean> {
    const tsconfig = path.join(context.workspaceRoot, 'tsconfig.json');
    return fs.existsSync(tsconfig);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    // Scan relevant source files (either changedFiles or targeted source dirs)
    const filesToScan = this.collectSourceFiles(root, context.changedFiles);

    for (const filePath of filesToScan) {
      if (signal?.aborted) break;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          // 1. Boundary Failure Patterns: Unsafe chained property access on nullable objects
          // (.filePath, .range, .id, .type, .category, .toUpperCase(), .trim(), .map(), .filter(), .join(), .split(), .replace())
          const unsafeChainingRegex = /(\b(finding|issue|target|location|item|rec|obj|param)\.(filePath|range|id|type|category))\.(toUpperCase|trim|map|filter|join|split|replace)\(/;
          const match = unsafeChainingRegex.exec(line);
          if (match) {
            // Check if there is nullish coalescing or guard on the line or preceding line
            const hasGuard = line.includes('?.') || line.includes('&&') || (i > 0 && lines[i - 1].includes('if (!'));
            if (!hasGuard) {
              findings.push({
                ruleId: 'TS-BOUNDARY-NULL-ACCESS',
                title: 'Unsafe boundary property chain without null check',
                message: `Property access \`${match[1]}.${match[4]}()\` on potentially nullable object without nullish check or safe boundary normalization.`,
                category: 'quality',
                severity: 'medium',
                confidence: 0.88,
                filePath,
                startLine: lineNum,
                sourceAnalyzer: this.id,
                evidence: [
                  {
                    type: 'ast_pattern',
                    description: `Chained operation \`${match[0]}\` lacks optional chaining or nullish guard.`,
                    source: this.id,
                    filePath,
                    line: lineNum,
                    snippet: line.trim(),
                  },
                ],
                inference: 'If the input object has undefined property, runtime TypeError will be thrown.',
                recommendation: `Normalize boundary data before calling \`.${match[4]}()\` or use optional chaining \`?.${match[4]}()\`.`,
              });
            }
          }

          // 2. Loose 'as any' escape hatches
          if (line.includes('as any') && !filePath.includes('test') && !filePath.includes('fixture')) {
            findings.push({
              ruleId: 'TS-UNSAFE-TYPE-CAST',
              title: 'Unsafe `as any` type assertion',
              message: 'Bypassing TypeScript type checking with `as any`.',
              category: 'quality',
              severity: 'low',
              confidence: 0.90,
              filePath,
              startLine: lineNum,
              sourceAnalyzer: this.id,
              evidence: [
                {
                  type: 'ast_pattern',
                  description: 'Explicit `as any` assertion disables static type safety.',
                  source: this.id,
                  filePath,
                  line: lineNum,
                  snippet: line.trim(),
                },
              ],
              inference: 'Type errors may surface at runtime due to bypassed compiler guarantees.',
              recommendation: 'Replace `as any` with proper union, generic constraint, or unknown with type guard.',
            });
          }
        }
      } catch {
        // ignore unreadable file
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
        filesScanned: filesToScan.length,
        findingCount: findings.length,
      },
      notes: `TypeScript safety scan completed across ${filesToScan.length} files.`,
    };
  }

  private collectSourceFiles(root: string, changedFiles?: string[]): string[] {
    if (changedFiles && changedFiles.length > 0) {
      return changedFiles
        .map(f => path.isAbsolute(f) ? f : path.resolve(root, f))
        .filter(f => fs.existsSync(f) && (f.endsWith('.ts') || f.endsWith('.tsx')));
    }

    const results: string[] = [];
    const scanDirs = ['packages', 'apps', 'src'];

    for (const dirName of scanDirs) {
      const fullDir = path.join(root, dirName);
      if (fs.existsSync(fullDir)) {
        this.walk(fullDir, results);
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
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          results.push(full);
        }
      }
    } catch {
      // ignore
    }
  }
}

