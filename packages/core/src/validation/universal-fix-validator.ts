import * as path from 'node:path';
import * as fs from 'node:fs';
import { Change, ChangeFile } from '../changes/change-model.js';
import { validateSyntax, SyntaxValidationResult, detectLanguage } from './syntax-validator.js';
import { validateStructuralIntegrity, StructuralValidationResult } from './structural-validator.js';
import { validateSemanticDiagnostics, SemanticValidationResult } from './semantic-validator.js';

export type FixRiskLevel = 'low' | 'medium' | 'high';

export interface ValidationFailure {
  filePath: string;
  stage: 'scope' | 'stale_check' | 'syntax' | 'structural' | 'semantic' | 'regression';
  message: string;
  details?: string[];
}

export interface FixValidationResult {
  valid: boolean;
  riskLevel: FixRiskLevel;
  failures: ValidationFailure[];
  warnings: string[];
}

export class UniversalFixValidator {
  /**
   * Section 20: Classifies fix by risk level.
   */
  public static classifyRisk(change: Change): FixRiskLevel {
    if (!change || !Array.isArray(change.files)) return 'high';

    // High risk checks
    for (const f of change.files) {
      const lower = f.filePath.toLowerCase();
      if (
        lower.endsWith('package.json') ||
        lower.endsWith('tsconfig.json') ||
        lower.includes('auth') ||
        lower.includes('security') ||
        lower.includes('secret')
      ) {
        return 'high';
      }

      // If change modifies exports, imports or signatures
      if (typeof f.newContent === 'string' && typeof f.originalContent === 'string') {
        if (
          f.newContent.includes('export ') && !f.originalContent.includes('export ') ||
          f.newContent.includes('import ') && !f.originalContent.includes('import ')
        ) {
          return 'high';
        }
      }
    }

    // Medium risk checks
    for (const f of change.files) {
      const lang = detectLanguage(f.filePath);
      if (lang === 'typescript' || lang === 'tsx' || lang === 'javascript' || lang === 'jsx' || lang === 'vue' || lang === 'svelte') {
        return 'medium';
      }
    }

    return 'low';
  }

  /**
   * Pre-Apply Patch Validation:
   * Validates patch scope, disk freshness, syntax, structure, and semantics BEFORE writing to disk.
   */
  public static validatePatch(change: Change, workspaceRoot: string = '/'): FixValidationResult {
    const failures: ValidationFailure[] = [];
    const warnings: string[] = [];
    const riskLevel = this.classifyRisk(change);

    if (!change || !Array.isArray(change.files) || change.files.length === 0) {
      failures.push({
        filePath: '',
        stage: 'scope',
        message: 'Patch validation failed: No files specified in change.',
      });
      return { valid: false, riskLevel, failures, warnings };
    }

    // Section 15: Patch Scope check
    if (change.files.length > 5 && change.issueIds.length <= 2) {
      failures.push({
        filePath: '',
        stage: 'scope',
        message: `Patch Scope Violation: Change affects ${change.files.length} files for ${change.issueIds.length} issue(s). Excessive change scope requires manual review.`,
      });
      return { valid: false, riskLevel, failures, warnings };
    }

    const normRoot = path.resolve(workspaceRoot);

    for (const file of change.files) {
      if (!file.filePath) {
        failures.push({
          filePath: '',
          stage: 'scope',
          message: 'Missing file path in change file record.',
        });
        continue;
      }

      const fullPath = path.resolve(normRoot, file.filePath);

      // Path traversal check
      const relative = path.relative(normRoot, fullPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        failures.push({
          filePath: file.filePath,
          stage: 'scope',
          message: `Security violation: Path traversal attempt outside workspace "${file.filePath}".`,
        });
        continue;
      }

      // Check existence
      if (!fs.existsSync(fullPath)) {
        failures.push({
          filePath: file.filePath,
          stage: 'stale_check',
          message: `Target file "${file.filePath}" was not found on disk.`,
        });
        continue;
      }

      // Section 27: Stale file / content modification check
      let currentDiskContent = '';
      try {
        currentDiskContent = fs.readFileSync(fullPath, 'utf-8');
      } catch (err: any) {
        failures.push({
          filePath: file.filePath,
          stage: 'stale_check',
          message: `Cannot read target file "${file.filePath}": ${err?.message}`,
        });
        continue;
      }

      if (typeof file.originalContent === 'string') {
        const normCurrent = currentDiskContent.replace(/\r\n/g, '\n');
        const normOriginal = file.originalContent.replace(/\r\n/g, '\n');
        if (normCurrent !== normOriginal) {
          failures.push({
            filePath: file.filePath,
            stage: 'stale_check',
            message: `The file changed after this fix was generated. CraftLens did not apply the stale fix. Run the audit again to generate an updated fix.`,
          });
          continue;
        }
      }

      // Compute simulated new content
      const simulatedNewContent = this.computeSimulatedContent(currentDiskContent, file);

      // Section 16: Before / After Parse Check (Syntax Validation)
      const beforeSyntax = validateSyntax(file.filePath, currentDiskContent);
      const afterSyntax = validateSyntax(file.filePath, simulatedNewContent);

      if (beforeSyntax.valid && !afterSyntax.valid) {
        failures.push({
          filePath: file.filePath,
          stage: 'syntax',
          message: `Syntax Regression: File was syntactically valid before the change, but the patch introduced syntax error(s).`,
          details: afterSyntax.errors,
        });
        continue;
      }

      // Section 5 & 6 & 12: Structural Integrity
      const structural = validateStructuralIntegrity(
        file.filePath,
        currentDiskContent,
        simulatedNewContent,
        workspaceRoot
      );
      if (!structural.valid) {
        failures.push({
          filePath: file.filePath,
          stage: 'structural',
          message: `Structural Validation Failed: ${structural.errors.join(' | ')}`,
          details: structural.errors,
        });
        continue;
      }
      if (structural.warnings.length > 0) {
        warnings.push(...structural.warnings);
      }

      // Section 4 & 17: Semantic / Diagnostic Difference Check
      const semantic = validateSemanticDiagnostics(
        file.filePath,
        currentDiskContent,
        simulatedNewContent
      );
      if (!semantic.valid) {
        failures.push({
          filePath: file.filePath,
          stage: 'semantic',
          message: `Semantic Regression: Patch introduced ${semantic.introducedErrors.length} new TypeScript error(s).`,
          details: semantic.introducedErrors,
        });
        continue;
      }
    }

    return {
      valid: failures.length === 0,
      riskLevel,
      failures,
      warnings,
    };
  }

  /**
   * Post-Apply Validation:
   * Validates files that have been written to disk before finalizing the transaction.
   */
  public static validateAppliedChange(
    change: Change,
    backups: Map<string, string>,
    workspaceRoot: string = '/'
  ): FixValidationResult {
    const failures: ValidationFailure[] = [];
    const warnings: string[] = [];
    const riskLevel = this.classifyRisk(change);
    const normRoot = path.resolve(workspaceRoot);

    for (const file of change.files) {
      const fullPath = path.resolve(normRoot, file.filePath);
      if (!fs.existsSync(fullPath)) {
        failures.push({
          filePath: file.filePath,
          stage: 'stale_check',
          message: `Applied file "${file.filePath}" was unexpectedly not found on disk.`,
        });
        continue;
      }

      const postContent = fs.readFileSync(fullPath, 'utf-8');
      const originalContent = backups.get(fullPath) || file.originalContent || '';

      // Level 1: Syntax Validation
      const beforeSyntax = validateSyntax(file.filePath, originalContent);
      const afterSyntax = validateSyntax(file.filePath, postContent);

      if (beforeSyntax.valid && !afterSyntax.valid) {
        failures.push({
          filePath: file.filePath,
          stage: 'syntax',
          message: `Post-Apply Syntax Regression: File broke syntax after writing to disk.`,
          details: afterSyntax.errors,
        });
        continue;
      }

      // Level 2: Structural Integrity
      const structural = validateStructuralIntegrity(
        file.filePath,
        originalContent,
        postContent,
        workspaceRoot
      );
      if (!structural.valid) {
        failures.push({
          filePath: file.filePath,
          stage: 'structural',
          message: `Post-Apply Structural Validation Failed: ${structural.errors.join(' | ')}`,
          details: structural.errors,
        });
        continue;
      }

      // Level 3: Semantic Diagnostics Diff
      const semantic = validateSemanticDiagnostics(
        file.filePath,
        originalContent,
        postContent
      );
      if (!semantic.valid) {
        failures.push({
          filePath: file.filePath,
          stage: 'semantic',
          message: `Post-Apply Semantic Regression: Patch introduced ${semantic.introducedErrors.length} new TypeScript error(s).`,
          details: semantic.introducedErrors,
        });
        continue;
      }
    }

    return {
      valid: failures.length === 0,
      riskLevel,
      failures,
      warnings,
    };
  }

  public static computeSimulatedContent(originalContent: string, file: ChangeFile): string {
    if (typeof file.newContent === 'string') {
      return file.newContent;
    }

    if (Array.isArray(file.edits) && file.edits.length > 0) {
      const lines = originalContent.split('\n');
      const sortedEdits = [...file.edits].sort((a, b) => b.startLine - a.startLine);
      for (const edit of sortedEdits) {
        const startIdx = Math.max(0, edit.startLine - 1);
        const endIdx = Math.max(startIdx, (edit.endLine || edit.startLine) - 1);

        if (edit.originalText && lines[startIdx]?.includes(edit.originalText)) {
          // Precise substring replacement on the target line
          lines[startIdx] = lines[startIdx].replace(edit.originalText, edit.replacementText);
        } else if (
          edit.startLine === edit.endLine &&
          typeof edit.startColumn === 'number' &&
          typeof edit.endColumn === 'number' &&
          edit.startColumn > 1 &&
          edit.endColumn > edit.startColumn &&
          lines[startIdx]
        ) {
          const l = lines[startIdx];
          lines[startIdx] = l.slice(0, edit.startColumn - 1) + edit.replacementText + l.slice(edit.endColumn - 1);
        } else {
          lines.splice(startIdx, endIdx - startIdx + 1, edit.replacementText);
        }
      }
      return lines.join('\n');
    }

    return originalContent;
  }
}
