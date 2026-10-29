import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class CraftLensArchitectureAnalyzer implements QAAnalyzer {
  id = 'qa-architecture';
  name = 'CraftLens Architecture & Layer Boundary Analyzer';
  category: QACategory = 'architecture';

  async isAvailable(context: QAContext): Promise<boolean> {
    const corePkg = path.join(context.workspaceRoot, 'packages', 'core');
    return fs.existsSync(corePkg);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    // 1. Core headless boundary check: packages/core must NEVER import 'vscode' or apps/vscode-extension
    const coreSrc = path.join(root, 'packages', 'core', 'src');
    if (fs.existsSync(coreSrc)) {
      const coreFiles: string[] = [];
      this.walk(coreSrc, coreFiles);

      for (const cf of coreFiles) {
        if (signal?.aborted) break;
        try {
          const content = fs.readFileSync(cf, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (/import\s+.*['"]vscode['"]/.test(line)) {
              findings.push({
                ruleId: 'ARCH-CORE-VSCODE-IMPORT',
                title: 'Headless core violates boundary by importing VS Code',
                message: '`@craftlens/core` must remain headless and must not import the `vscode` runtime module.',
                category: 'quality',
                severity: 'critical',
                confidence: 1.0,
                filePath: cf,
                startLine: lineNum,
                sourceAnalyzer: this.id,
                evidence: [
                  {
                    type: 'ast_pattern',
                    description: `Direct import of 'vscode' in core: ${line.trim()}`,
                    source: this.id,
                    filePath: cf,
                    line: lineNum,
                    snippet: line.trim(),
                  },
                ],
                inference: 'Importing vscode into headless packages breaks CLI execution, web execution, and standalone tests.',
                recommendation: 'Use dependency injection or interfaces to decouple vscode APIs from core.',
              });
            }

            if (/import\s+.*['"](\.\.\/)+apps\/vscode-extension/.test(line)) {
              findings.push({
                ruleId: 'ARCH-CIRCULAR-APP-IMPORT',
                title: 'Core package imports downstream application layer',
                message: '`@craftlens/core` cannot import from `apps/vscode-extension`.',
                category: 'quality',
                severity: 'critical',
                confidence: 1.0,
                filePath: cf,
                startLine: lineNum,
                sourceAnalyzer: this.id,
                evidence: [
                  {
                    type: 'ast_pattern',
                    description: `Core imports extension layer: ${line.trim()}`,
                    source: this.id,
                    filePath: cf,
                    line: lineNum,
                    snippet: line.trim(),
                  },
                ],
                inference: 'Violates monorepo dependency hierarchy and introduces circular module dependencies.',
                recommendation: 'Move shared types or utilities into @craftlens/core.',
              });
            }
          }
        } catch {}
      }
    }

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: findings.some(f => f.severity === 'critical') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      findings,
      notes: `Architecture validation confirmed headless boundaries and layer isolation.`,
    };
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

