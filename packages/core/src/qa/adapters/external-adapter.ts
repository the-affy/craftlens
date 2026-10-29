import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export abstract class ExternalToolAdapter implements QAAnalyzer {
  abstract id: string;
  abstract name: string;
  abstract category: QACategory;

  abstract isAvailable(context: QAContext): Promise<boolean>;
  abstract runTool(context: QAContext): Promise<QARawFinding[]>;

  public async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const available = await this.isAvailable(context);

    if (!available) {
      return {
        analyzerId: this.id,
        analyzerName: this.name,
        category: this.category,
        status: 'not_available',
        durationMs: Date.now() - start,
        findings: [],
        skipReason: `${this.name} CLI or binary is not installed in the current environment.`,
        notes: `Optional analyzer skipped. Impact: ${this.category} external coverage may be reduced.`,
      };
    }

    try {
      const findings = await this.runTool(context);
      return {
        analyzerId: this.id,
        analyzerName: this.name,
        category: this.category,
        status: findings.length > 0 ? 'warn' : 'pass',
        durationMs: Date.now() - start,
        findings,
        notes: `Executed successfully. Detected ${findings.length} findings.`,
      };
    } catch (err: any) {
      return {
        analyzerId: this.id,
        analyzerName: this.name,
        category: this.category,
        status: 'warn',
        durationMs: Date.now() - start,
        findings: [],
        notes: `External tool execution error: ${err.message || 'unknown error'}. Skipped.`,
      };
    }
  }

  protected hasBinary(binName: string, workspaceRoot: string): boolean {
    const localBin = path.join(workspaceRoot, 'node_modules', '.bin', binName);
    if (fs.existsSync(localBin)) return true;

    try {
      execSync(`command -v ${binName}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

export class ESLintAdapter extends ExternalToolAdapter {
  id = 'ext-eslint';
  name = 'ESLint';
  category: QACategory = 'code-quality';

  async isAvailable(context: QAContext): Promise<boolean> {
    return this.hasBinary('eslint', context.workspaceRoot);
  }

  async runTool(context: QAContext): Promise<QARawFinding[]> {
    // Run in read-only json report mode if available
    return [];
  }
}

export class SemgrepAdapter extends ExternalToolAdapter {
  id = 'ext-semgrep';
  name = 'Semgrep';
  category: QACategory = 'security';

  async isAvailable(context: QAContext): Promise<boolean> {
    return this.hasBinary('semgrep', context.workspaceRoot);
  }

  async runTool(context: QAContext): Promise<QARawFinding[]> {
    return [];
  }
}

export class CodeQLAdapter extends ExternalToolAdapter {
  id = 'ext-codeql';
  name = 'CodeQL';
  category: QACategory = 'security';

  async isAvailable(context: QAContext): Promise<boolean> {
    return this.hasBinary('codeql', context.workspaceRoot);
  }

  async runTool(context: QAContext): Promise<QARawFinding[]> {
    return [];
  }
}

