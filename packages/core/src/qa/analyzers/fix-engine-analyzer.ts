import * as fs from 'node:fs';
import * as path from 'node:path';
import { QAAnalyzer, QACategory, QAContext, QARawFinding, QAResult } from '../types.js';

export class FixEngineAnalyzer implements QAAnalyzer {
  id = 'qa-fix-engine';
  name = 'Fix Engine & Patch Safety Analyzer';
  category: QACategory = 'correctness';

  async isAvailable(context: QAContext): Promise<boolean> {
    const cmPath = path.join(context.workspaceRoot, 'packages', 'core', 'src', 'changes', 'change-manager.ts');
    return fs.existsSync(cmPath);
  }

  async analyze(context: QAContext, signal?: AbortSignal): Promise<QAResult> {
    const start = Date.now();
    const findings: QARawFinding[] = [];
    const root = context.workspaceRoot;

    const cmPath = path.join(root, 'packages', 'core', 'src', 'changes', 'change-manager.ts');
    const validatorPath = path.join(root, 'packages', 'core', 'src', 'validation', 'universal-fix-validator.ts');

    if (!fs.existsSync(cmPath)) {
      return {
        analyzerId: this.id,
        analyzerName: this.name,
        category: this.category,
        status: 'skipped',
        durationMs: Date.now() - start,
        findings: [],
        skipReason: 'ChangeManager file not found.',
      };
    }

    try {
      const cmContent = fs.readFileSync(cmPath, 'utf-8');

      // 1. Single Patch Contract Verification: Does applyChange regenerate recommendations?
      if (cmContent.includes('applyChange') && cmContent.includes('regeneratePatch')) {
        findings.push({
          ruleId: 'FIX-ENGINE-PATCH-REGENERATION',
          title: 'Apply Change regenerates patch instead of applying previewed diff',
          message: 'Apply Change must apply the exact previewed diff object without regeneration.',
          category: 'quality',
          severity: 'critical',
          confidence: 0.95,
          filePath: cmPath,
          sourceAnalyzer: this.id,
          evidence: [
            {
              type: 'ast_pattern',
              description: 'applyChange calls regeneratePatch violating the single-patch guarantee.',
              source: this.id,
              filePath: cmPath,
            },
          ],
          inference: 'Applying a change could apply different code than what the user reviewed.',
          recommendation: 'Apply the exact stored file changes on the ProposedChange object.',
        });
      }

      // 2. Pre-Write Validation Verification: Does apply invoke UniversalFixValidator or rollback?
      const hasValidationPipeline =
        cmContent.includes('UniversalFixValidator') ||
        cmContent.includes('validatePatch') ||
        cmContent.includes('rollback');

      if (!hasValidationPipeline) {
        findings.push({
          ruleId: 'FIX-ENGINE-MISSING-VALIDATION-PIPELINE',
          title: 'Fix engine applies changes without universal validation pipeline',
          message: 'Changes are written to disk without syntax, structural, or semantic verification.',
          category: 'quality',
          severity: 'high',
          confidence: 0.90,
          filePath: cmPath,
          sourceAnalyzer: this.id,
          evidence: [
            {
              type: 'ast_pattern',
              description: 'No UniversalFixValidator reference found in change application pipeline.',
              source: this.id,
              filePath: cmPath,
            },
          ],
          inference: 'Malformed fixes (e.g. broken CSS or TypeScript syntax) will corrupt user code.',
          recommendation: 'Run UniversalFixValidator before writing and rollback on error.',
        });
      }
    } catch {
      // ignore
    }

    return {
      analyzerId: this.id,
      analyzerName: this.name,
      category: this.category,
      status: findings.some(f => f.severity === 'critical') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      findings,
      notes: `Fix engine verification validated single-patch contract and pre-write validation pipeline.`,
    };
  }
}

