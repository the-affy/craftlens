# Anti-Slop Rule Authoring Guide

This guide establishes the mandatory standards and lifecycle for authoring rules in Anti-Slop.

---

## 1. Rule Identification & Categories

Every rule must have a **permanent, stable rule ID**. Never rename an existing rule ID once released, as users rely on them in `.anti-sloprc` and suppression comments.

### ID Prefixes by Category

| Prefix | Category | Focus |
|---|---|---|
| `CD-` | Code Quality | Complexity, deep nesting, state duplication |
| `AP-` | AI Patchwork | Defensive null cascades, any escape hatches, exception swallowing |
| `FN-` | Functionality | Ineffective buttons, unhandled events, non-interactive handlers |
| `AX-` | Accessibility | Missing names, unannounced state, keyboard traps |
| `CSS-`| Styling / CSS | Magic numbers, !important patches, broken token usage |
| `PH-` | Placeholders | Visible TODOs, Lorem Ipsum, fake mock data |
| `AS-` | Clusters | Multi-signal pattern composites |

---

## 2. Rule Contract (`AntiSlopRule`)

Implement the `AntiSlopRule` interface:

```typescript
import { AntiSlopRule, Finding, AnalysisContext, astEvidence } from '@anti-slop/core';
import { ParsedDocument } from '@anti-slop/parser';

export const MY_RULE: AntiSlopRule = {
  id: 'AP-008',
  category: 'patchwork',
  title: 'Silent Exception Swallowing',
  description: 'Exception is caught and discarded with no recovery or logging.',
  rationale: 'AI agents frequently wrap failing code in empty catch blocks to mask errors.',
  severity: 'warning',
  confidence: 0.95,
  engine: 'ast',
  recommendation: 'Log the caught error or handle recovery explicitly.',
  fix: 'safe',
  platforms: ['javascript', 'typescript', 'web'],
  tags: ['error-handling', 'ai-patchwork'],
  detect(context: AnalysisContext): Finding[] {
    // AST traversal & detection logic
  },
};
```

---

## 3. Severity vs. Confidence

**Never use severity as a proxy for confidence.**
- **Severity** denotes business/runtime impact: `blocker` | `error` | `warning` | `suggestion` | `info`.
- **Confidence** denotes certainty of detection: float from `0.0` to `1.0`.

A rule may detect a suggestion with 99% certainty, or detect a potential error with 70% certainty.

---

## 4. Evidence Before Warnings

Every finding must provide concrete evidence explaining **why** the rule fired:

```typescript
evidence: [
  astEvidence(
    'Catch block contains no statements or recovery actions.',
    location,
    snippet
  ),
]
```

---

## 5. Quick Fixes: Safe vs. Assisted

- **`safe`**: Completely deterministic code transformations that have zero chance of altering business logic, authentication, or data integrity (e.g. replacing `any` with `unknown`, inserting explicit logger).
- **`assisted`**: Useful transformations that require developer review (e.g., adding `role="button" tabIndex={0}`).
- **`none`**: When automated modification could break intent.

---

## 6. Anti-False-Positive Obligation

Before submitting any rule, answer:
> **"What legitimate code could look like this?"**

Always support:
- Intentional comments (e.g., `// intentional`, `// ignore`, `// legacy interop`).
- Contextual suppressions (`// anti-slop-disable-next-line <ID>`).
- Platform and project invariants.

---

## 7. Mandatory Test Fixtures

Every rule **must** provide 4 distinct test fixture cases:
1. `should-flag.ts` (Positive case)
2. `should-not-flag.ts` (Negative case)
3. `edge-case.ts` (Edge conditions, nested structures, empty bindings)
4. `false-positive.ts` (Legitimate developer patterns that must not be flagged)
