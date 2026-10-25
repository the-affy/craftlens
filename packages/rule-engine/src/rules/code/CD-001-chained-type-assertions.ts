import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const CD_001_RULE: CraftLensRule = {
  id: 'CD-001',
  category: 'code',
  title: 'Chained Type Assertions',
  description: 'Suspicious chained TypeScript type assertion (e.g., value as unknown as Target) bypasses type checking.',
  rationale:
    'Chained type assertions force the compiler to treat incompatible types as compatible, masking domain modeling bugs and risking runtime errors.',
  severity: 'warning',
  confidence: 0.92,
  engine: 'ast',
  recommendation: 'Validate the data structure using runtime type guards, type narrowing, or a schema validator instead of double-asserting.',
  fix: 'assisted',
  platforms: ['typescript'],
  tags: ['types', 'type-safety', 'assertions', 'ai-patchwork'],
  minimumAuditLevel: 'moderate',
  supportedActions: ['explain', 'not_a_problem'],
  problemTitle: 'Type assertions',
  whatIsWrong: 'Chained type assertion forces incompatible types without runtime validation.',
  whyItMatters:
    'Using `as unknown as Type` bypasses the TypeScript compiler, masking underlying data mismatches that cause runtime crashes.',
  howToFix: 'Replace double assertion with an explicit type guard or schema validation.',
  suggestedSteps: [
    'Check why the source and target types are incompatible.',
    'Write a type guard function (e.g. `isTarget(data)`) or parse with a schema.',
    'Narrow the type safely before accessing properties.',
  ],
  diagnosis: 'Chained type assertion forces incompatible types without runtime validation.',
  structuredRecommendation: {
    summary: 'Replace chained type assertion with proper type narrowing or runtime validation.',
    why: 'Using `as unknown as Type` eliminates TypeScript compiler guarantees.',
    rationale: 'Using `as unknown as Type` or `as any as Type` eliminates TypeScript compiler guarantees.',
    howToFix: 'Validate data with type guards or a schema validator instead of double-asserting.',
    steps: [
      'Check why the source and target types are incompatible.',
      'Write a type guard function (e.g. `isTarget(data)`) or parse with a schema.',
      'Narrow the type safely before accessing properties.',
    ],
    alternatives: [
      {
        id: 'alt-type-guard',
        title: 'User-Defined Type Guard',
        description: 'Implement a boolean predicate function `isTarget(val: unknown): val is Target` to safely verify properties.',
        tradeoffs: ['Adds runtime safety with zero performance overhead for small objects.'],
      },
      {
        id: 'alt-schema-validation',
        title: 'Runtime Schema Validation',
        description: 'Parse untrusted input with a schema validator such as Zod or Valibot.',
        tradeoffs: ['Provides complete runtime guarantees and detailed error messages.'],
      },
    ],
    fix: {
      type: 'assisted',
      description: 'Replace chained assertion with type guard or explicit narrowing.',
    },
  },
  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) {
      return [];
    }

    if (context.filePath.endsWith('.d.ts')) {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;
    const sourceText = parsed.sourceText;

    function unwrapParentheses(node: ts.Node): ts.Node {
      let current = node;
      while (ts.isParenthesizedExpression(current)) {
        current = current.expression;
      }
      return current;
    }

    function checkNode(node: ts.Node): void {
      if (ts.isAsExpression(node)) {
        const inner = unwrapParentheses(node.expression);
        if (ts.isAsExpression(inner) || ts.isTypeAssertionExpression(inner)) {
          const location = parsed!.getLocation(node);
          const snippet = node.getText(sourceFile);

          findings.push({
            ruleId: 'CD-001',
            message: `Chained type assertion "${snippet.length > 50 ? snippet.substring(0, 47) + '...' : snippet}" bypasses TypeScript type safety.`,
            description:
              'Double assertion (such as "as unknown as Target" or "as any as Target") instructs the compiler to disregard type incompatibilities, creating an invisible runtime failure risk.',
            severity: 'warning',
            confidence: 0.92,
            location,
            evidence: [
              astEvidence(
                'Found nested/chained type assertion expression in TypeScript AST.',
                location,
                snippet
              ),
            ],
            recommendation: 'Validate the data structure using runtime type guards or schema validation instead of chained assertions.',
            supportedActions: ['explain', 'not_a_problem'],
          });
        }
      } else if (ts.isTypeAssertionExpression(node)) {
        const inner = unwrapParentheses(node.expression);
        if (ts.isTypeAssertionExpression(inner) || ts.isAsExpression(inner)) {
          const location = parsed!.getLocation(node);
          const snippet = node.getText(sourceFile);

          findings.push({
            ruleId: 'CD-001',
            message: `Chained type assertion "${snippet.length > 50 ? snippet.substring(0, 47) + '...' : snippet}" bypasses TypeScript type safety.`,
            description:
              'Double assertion instructs the compiler to disregard type incompatibilities, creating an invisible runtime failure risk.',
            severity: 'warning',
            confidence: 0.92,
            location,
            evidence: [
              astEvidence(
                'Found nested/chained prefix type assertion in TypeScript AST.',
                location,
                snippet
              ),
            ],
            recommendation: 'Validate the data structure using runtime type guards or schema validation instead of chained assertions.',
            supportedActions: ['explain', 'not_a_problem'],
          });
        }
      }

      ts.forEachChild(node, checkNode);
    }

    ts.forEachChild(sourceFile, checkNode);
    return findings;
  },
};
