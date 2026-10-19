import ts from 'typescript';
import {
  AntiSlopRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@anti-slop/core';
import { ParsedDocument } from '@anti-slop/parser';

export const AP_014_RULE: AntiSlopRule = {
  id: 'AP-014',
  category: 'patchwork',
  title: 'Unsafe Any Escape Hatch',
  description: "Explicit use of 'any' bypasses TypeScript type checks and masks underlying structural mismatches.",
  rationale:
    "AI coding agents frequently resort to 'any' or 'as any' to quickly silence type errors instead of resolving domain models or using proper type guards.",
  severity: 'warning',
  confidence: 0.90,
  engine: 'ast',
  recommendation: "Replace 'any' with 'unknown' and use type narrowing, or specify the expected type/interface.",
  fix: 'safe',
  platforms: ['typescript'],
  tags: ['types', 'typescript', 'ai-patchwork', 'soundness'],
  minimumAuditLevel: 'moderate',
  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) {
      return [];
    }

    // Never flag declaration files (.d.ts) as they often wrap untyped legacy modules
    if (context.filePath.endsWith('.d.ts')) {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;
    const sourceText = parsed.sourceText;

    function visit(node: ts.Node): void {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const location = parsed!.getLocation(node);

        // Check if there is an intentional comment on the same line or preceding line
        const lineStart = sourceText.lastIndexOf('\n', start) + 1;
        const lineText = sourceText.substring(lineStart, sourceText.indexOf('\n', end) !== -1 ? sourceText.indexOf('\n', end) : undefined);
        const intentionalCommentPattern = /\/\/\s*(legacy|interop|external|third-party|untyped)/i;
        if (intentionalCommentPattern.test(lineText)) {
          return; // Intentional interop escape hatch
        }

        findings.push({
          ruleId: 'AP-014',
          message: "Explicit 'any' type bypasses TypeScript type safety.",
          description:
            "Using 'any' turns off type checking for this expression and all dependent expressions. This pattern commonly appears in AI-generated patchwork to silence compiler diagnostics.",
          severity: 'warning',
          confidence: 0.90,
          location,
          evidence: [
            astEvidence(
              "Found explicit 'any' type keyword in type annotation or assertion.",
              location,
              lineText.trim()
            ),
          ],
          recommendation: "Replace 'any' with 'unknown' and use type guards or explicit interfaces.",
          fix: {
            title: "Replace 'any' with 'unknown'",
            kind: 'safe',
            changes: [
              {
                range: location,
                newText: 'unknown',
              },
            ],
          },
        });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
