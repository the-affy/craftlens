import ts from 'typescript';
import {
  CraftLensRule,
  Finding,
  AnalysisContext,
  astEvidence,
} from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const RE_001_RULE: CraftLensRule = {
  id: 'RE-001',
  category: 'react',
  title: 'Effect for Derived Value',
  description: 'Redundant useEffect hook used only to calculate or sync derived state from props or state.',
  rationale:
    'Updating state inside an effect in response to prop/state changes causes redundant render passes, out-of-sync state, and flashes of stale content. Compute derived values directly during render or with useMemo.',
  severity: 'warning',
  confidence: 0.90,
  engine: 'ast',
  recommendation: 'Compute the derived value directly in the component body (e.g., const fullName = firstName + " " + lastName;) instead of maintaining separate state via useEffect.',
  fix: 'manual',
  platforms: ['react', 'web'],
  tags: ['react', 'hooks', 'performance', 'state-management', 'anti-pattern'],
  minimumAuditLevel: 'moderate',
  supportedActions: ['explain', 'suggest_better_design', 'not_a_problem'],
  problemTitle: 'React state & effects',
  whatIsWrong: 'useEffect updates secondary state for a value that should be derived directly.',
  whyItMatters:
    'Syncing state inside useEffect triggers redundant re-renders, causes UI flicker, and leads to stale state cascade bugs.',
  howToFix:
    'Compute the derived value directly in the component body during render (or with useMemo if expensive).',
  suggestedSteps: [
    'Delete the secondary useState and the useEffect that updates it.',
    'Compute the value directly as a local variable during render.',
    'If the calculation is heavy, wrap in useMemo with the source dependencies.',
  ],
  diagnosis: 'useEffect hook synchronizes state directly from dependencies rather than computing it during render.',
  structuredRecommendation: {
    summary: 'Remove redundant state and effect; compute value directly during render.',
    why: 'Syncing state in useEffect triggers redundant render cycles and risks race conditions.',
    rationale: 'In React, if a value can be computed from existing props or state, it should never be stored in separate state via useEffect.',
    howToFix: 'Compute the derived value directly in render or wrap in useMemo.',
    steps: [
      'Delete the secondary useState and the useEffect that updates it.',
      'Compute the value directly as a local variable during render.',
      'If the calculation is heavy, wrap in useMemo with the source dependencies.',
    ],
    alternatives: [
      {
        id: 'alt-inline-computation',
        title: 'Direct Inline Computation',
        description: 'Calculate the value directly during render: `const fullName = firstName + " " + lastName;`',
        tradeoffs: ['Zero extra renders, instant synchronization, simplified component lifecycle.'],
      },
      {
        id: 'alt-use-memo',
        title: 'Memoize with useMemo',
        description: 'If the computation is computationally expensive, wrap it in useMemo: `const filtered = useMemo(() => compute(items), [items]);`',
        tradeoffs: ['Avoids recomputation on unrelated renders while avoiding state desynchronization.'],
      },
    ],
  },
  detect(context: AnalysisContext): Finding[] {
    const parsed = context.parsedAst as ParsedDocument | undefined;
    if (!parsed || !parsed.sourceFile) {
      return [];
    }

    const findings: Finding[] = [];
    const sourceFile = parsed.sourceFile;

    function isSetterCall(call: ts.CallExpression): boolean {
      const expr = call.expression;
      if (ts.isIdentifier(expr)) {
        return /^set[A-Z0-9]/.test(expr.text);
      }
      return false;
    }

    function containsAsyncOrListener(node: ts.Node): boolean {
      let hasAsyncOrListener = false;
      function walk(n: ts.Node) {
        if (hasAsyncOrListener) return;

        if (ts.isCallExpression(n)) {
          const calleeText = n.expression.getText(sourceFile);
          if (
            calleeText === 'fetch' ||
            calleeText.includes('axios') ||
            calleeText === 'setTimeout' ||
            calleeText === 'setInterval' ||
            calleeText.includes('addEventListener') ||
            calleeText.includes('subscribe')
          ) {
            hasAsyncOrListener = true;
            return;
          }
        }

        if (ts.isAwaitExpression(n) || ts.isReturnStatement(n)) {
          hasAsyncOrListener = true;
          return;
        }

        ts.forEachChild(n, walk);
      }
      walk(node);
      return hasAsyncOrListener;
    }

    function checkCall(node: ts.CallExpression): void {
      let isUseEffect = false;
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'useEffect') {
        isUseEffect = true;
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        callee.expression.getText(sourceFile) === 'React' &&
        callee.name.text === 'useEffect'
      ) {
        isUseEffect = true;
      }

      if (!isUseEffect || node.arguments.length === 0) {
        return;
      }

      const callback = node.arguments[0];
      if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
        return;
      }

      // Check if the effect has async operations, timers, event listeners, or cleanup returns
      if (containsAsyncOrListener(callback.body)) {
        return;
      }

      // Check if body is a concise setter call: () => setName(user.name)
      if (ts.isCallExpression(callback.body)) {
        if (isSetterCall(callback.body)) {
          recordFinding(node, callback.body);
          return;
        }
      }

      // Check if body is a block with only setter call statements
      if (ts.isBlock(callback.body)) {
        const statements = callback.body.statements;
        if (statements.length > 0 && statements.length <= 2) {
          const allSetters = statements.every(stmt => {
            if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
              return isSetterCall(stmt.expression);
            }
            return false;
          });

          if (allSetters) {
            recordFinding(node, statements[0]);
          }
        }
      }
    }

    function recordFinding(effectNode: ts.CallExpression, setterNode: ts.Node): void {
      const location = parsed!.getLocation(effectNode);
      const snippet = effectNode.getText(sourceFile);

      findings.push({
        ruleId: 'RE-001',
        message: 'Redundant useEffect used only to derive state. Compute the value directly during render.',
        description:
          'Deriving state inside an effect causes an extra render cycle and risks out-of-sync state. If a value can be computed from existing props or state, calculate it directly during render or use useMemo.',
        severity: 'warning',
        confidence: 0.90,
        location,
        evidence: [
          astEvidence(
            'useEffect body contains only state setter calls without external side-effects, listeners, or timers.',
            location,
            setterNode.getText(sourceFile)
          ),
        ],
        recommendation: 'Compute the value directly during render instead of synchronizing state in an effect.',
        supportedActions: ['explain', 'suggest_better_design', 'not_a_problem'],
      });
    }

    function walk(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        checkCall(node);
      }
      ts.forEachChild(node, walk);
    }

    walk(sourceFile);
    return findings;
  },
};
