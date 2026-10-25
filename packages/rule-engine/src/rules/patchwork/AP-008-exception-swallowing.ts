import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
  createLocation,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const AP_008_RULE: CraftLensRule = {
  id: 'AP-008',
  category: 'patchwork',
  title: 'Silent Exception Swallowing',
  description: 'Exception is silently caught and discarded with no logging, recovery, or user feedback.',
  rationale:
    'AI-generated code frequently wraps failing logic in empty catch blocks as a quick patch to suppress errors rather than diagnosing the failure or handling it properly.',
  severity: 'warning',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Handle the failure explicitly, log the error, or rethrow it to caller.',
  fix: 'safe',
  platforms: ['javascript', 'typescript', 'node', 'web'],
  problemTitle: 'Error handling',
  whatIsWrong: 'Error is caught but not handled.',
  whyItMatters:
    'Failures can disappear silently, making bugs difficult to diagnose and leaving users without useful feedback.',
  howToFix:
    'Handle the error explicitly: show an error state, log the failure, retry, or propagate to an error boundary.',
  suggestedSteps: [
    'Decide whether the user needs feedback.',
    'Add an appropriate error state if needed.',
    'Log the failure if useful for debugging.',
    'Otherwise rethrow/propagate it.',
  ],
  structuredRecommendation: {
    summary: "Your code catches errors but doesn't do anything with them.",
    why: 'This catch block catches the failure but does not recover, report it, or pass it to another error boundary.',
    howToFix: 'Handle the failure explicitly, or propagate it to a layer that can provide the appropriate recovery behavior.',
    steps: [
      'Decide whether the user needs feedback.',
      'Add an appropriate error state if needed.',
      'Log the failure if useful for debugging.',
      'Otherwise rethrow/propagate it.',
    ],
    fix: {
      type: 'safe',
      description: 'Log the error or handle explicitly.',
    },
  },
  supportedActions: ['fix', 'explain', 'not_a_problem'],
  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) {
      return [];
    }
    const parsedDoc = parsed;

    const findings: Finding[] = [];
    const sourceFile = parsedDoc.sourceFile;
    const sourceText = parsedDoc.sourceText;

    function checkCatchClause(catchClause: ts.CatchClause): void {
      const block = catchClause.block;
      const statements = block.statements;

      // Extract raw text within block braces to check for intentional comments or content
      const blockStart = block.getStart(sourceFile);
      const blockEnd = block.getEnd();
      const innerText = sourceText.substring(blockStart, blockEnd);

      // Check for intentional ignore comments (False Positive Mitigation)
      const intentionalCommentPattern = /\/\/\s*(intentional|ignore|deliberate|expected|noop|suppress|safe|by design)/i;
      const blockCommentPattern = /\/\*\s*(intentional|ignore|deliberate|expected|noop|suppress|safe|by design)[\s\S]*?\*\//i;
      if (intentionalCommentPattern.test(innerText) || blockCommentPattern.test(innerText)) {
        return; // Intentionally ignored, do not flag!
      }

      let isSwallowed = false;
      let reason = '';

      if (statements.length === 0) {
        // Completely empty catch block
        isSwallowed = true;
        reason = 'Catch block contains no statements or recovery actions.';
      } else {
        // Check if all statements are trivial/no-ops
        const hasSubstantialStatement = statements.some(stmt => {
          if (stmt.kind === ts.SyntaxKind.EmptyStatement) return false;
          if (ts.isExpressionStatement(stmt)) {
            const expr = stmt.expression;
            // e.g. undefined; null; "void 0";
            if (expr.kind === ts.SyntaxKind.Identifier && (expr as ts.Identifier).text === 'undefined') return false;
            if (expr.kind === ts.SyntaxKind.NullKeyword) return false;
          }
          return true;
        });

        if (!hasSubstantialStatement) {
          isSwallowed = true;
          reason = 'Catch block contains only no-op statements without recovery or logging.';
        }
      }

      if (!isSwallowed) {
        return;
      }

      const location = parsedDoc.getLocation(catchClause);
      const catchVar = catchClause.variableDeclaration?.name.getText(sourceFile);
      const errVarName = catchVar || 'error';

      // Build Safe QuickFix
      let fixNewText: string;
      const blockOpenParen = block.getStart(sourceFile);
      if (!catchClause.variableDeclaration) {
        // Catch with no binding: catch {} -> catch (error) { console.error(error); }
        fixNewText = `catch (${errVarName}) {\n    console.error(${errVarName});\n  }`;
      } else {
        // Existing binding: catch (e) {} -> catch (e) { console.error(e); }
        fixNewText = `{\n    console.error(${errVarName});\n  }`;
      }

      findings.push({
        ruleId: 'AP-008',
        message: 'Error is caught but not handled.',
        problemTitle: 'Error handling',
        whatIsWrong: 'The error is caught but never handled.',
        whyItMatters:
          'Failures can disappear silently, making bugs difficult to diagnose and leaving users without useful feedback.',
        howToFix: 'Handle the error explicitly or propagate it to an error boundary.',
        suggestedSteps: [
          'Decide whether the user needs feedback.',
          'Add an appropriate error state if needed.',
          'Log the failure if useful for debugging.',
          'Otherwise rethrow or propagate to an error boundary.',
        ],
        description:
          'The catch block discards the error and provides no recovery, logging, or user feedback. This pattern commonly appears in AI-generated patchwork.',
        severity: 'warning',
        confidence: 0.95,
        location,
        evidence: [
          astEvidence(
            reason,
            location,
            sourceText.substring(catchClause.getStart(sourceFile), Math.min(catchClause.getEnd(), catchClause.getStart(sourceFile) + 120))
          ),
        ],
        recommendation: 'Log the caught error or handle recovery explicitly.',
        fix: {
          title: `Log ${errVarName} to console`,
          kind: 'safe',
          changes: [
            {
              range: !catchClause.variableDeclaration
                ? location
                : parsedDoc.getLocation(block),
              newText: fixNewText,
            },
          ],
        },
      });
    }

    function visit(node: ts.Node): void {
      if (ts.isCatchClause(node)) {
        checkCatchClause(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
  },
};
