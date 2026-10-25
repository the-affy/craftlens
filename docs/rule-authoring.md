# CraftLens Rule Authoring Guide

This guide establishes the mandatory standards and lifecycle for authoring rules in CraftLens.

---

## 1. Rule Identification & Categories

Every rule must have a **permanent, stable rule ID**. Never rename an existing rule ID once released, as users rely on them in `.craftlensrc` and suppression comments.

### ID Prefixes by Category

| Prefix | Category | Focus |
|---|---|---|
| `CD-` | Code Quality | Complexity, deep nesting, state duplication |
| `AP-` | AI Patchwork | Defensive null cascades, any escape hatches, exception swallowing |
| `FN-` | Functionality | Ineffective buttons, unhandled events, non-interactive handlers |
| `AX-` | Accessibility | Missing names, unannounced state, keyboard traps |
| `CSS-`| Styling / CSS | Magic numbers, !important patches, broken token usage |
| `VH-` | Visual Hierarchy | CTA competition, heading scale mismatch, visual weighting |
| `CP-` | Surface Composition | Excessive card repetition, nested card containers |
| `CX-` | Project Consistency | Reusable component bypass, scale/radius/color token drift |
| `ID-` | Intent & Decision | Meaningless decoration, dead-end CTAs, context-less metrics |
| `PH-` | Placeholders | Visible TODOs, Lorem Ipsum, fake mock data |
| `AS-` | Clusters | Multi-signal pattern composites |

---

## 2. Rule Contract (`CraftLensRule`)

Implement the `CraftLensRule` interface with actionable recommendations:

```typescript
import { CraftLensRule, Finding, AnalysisContext, astEvidence } from '@craftlens/core';
import { ParsedDocument } from '@craftlens/parser';

export const MY_RULE: CraftLensRule = {
  id: 'VH-007',
  category: 'visual-hierarchy',
  title: 'Multiple Primary Actions',
  description: 'Container defines multiple visually prominent primary action buttons.',
  rationale: 'Equal visual prominence across multiple actions causes decision paralysis.',
  severity: 'warning',
  confidence: 0.90,
  minimumAuditLevel: 'moderate',
  engine: 'ast',
  supportedActions: ['fix', 'preview', 'explain', 'suggest_better_design', 'not_a_problem'],
  ruleRecommendation: {
    summary: 'Establish one primary action and demote secondary actions to secondary/outline.',
    rationale: 'Clear visual subordination directs user attention to the single primary workflow.',
    alternatives: [
      {
        id: 'alt-secondary',
        title: 'Single Primary + Secondary Buttons',
        description: 'Keep the most important action solid and convert peers to variant="secondary".',
        tradeoffs: ['Secondary actions remain immediately clickable without competing for attention.'],
      },
      {
        id: 'alt-split-dropdown',
        title: 'Action Group / Dropdown',
        description: 'Consolidate auxiliary actions into an overflow menu.',
        tradeoffs: ['Saves surface area, requires an extra click for tertiary options.'],
      },
    ],
    fix: {
      type: 'assisted',
      description: 'Convert secondary buttons to variant="secondary"',
    },
  },
  detect(context: AnalysisContext): Finding[] {
    // AST traversal, intent check & baseline comparison
  },
};
```

---

## 3. Severity vs. Confidence vs. Audit Level

- **Severity** denotes impact: `blocker` | `error` | `warning` | `suggestion` | `info`.
- **Confidence** denotes certainty: float from `0.0` to `1.0`.
- **Minimum Audit Level** controls when the rule runs:
  - `'easy'`: Critical bugs, credentials, dead code, blatant crashes (zero noise tolerance).
  - `'moderate'`: Architecture, UX, common consistency issues (default continuous audit).
  - `'hard'`: Surface hierarchy, intent debt, visual genericity.
  - `'strict'`: Exhaustive inspection of tokens, edge cases, and design contracts.

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
- Contextual suppressions (`// craftlens-disable-next-line <ID>`).
- Platform and project invariants.

---

## 7. Mandatory Test Fixtures

Every rule **must** provide 4 distinct test fixture cases:
1. `should-flag.ts` (Positive case)
2. `should-not-flag.ts` (Negative case)
3. `edge-case.ts` (Edge conditions, nested structures, empty bindings)
4. `false-positive.ts` (Legitimate developer patterns that must not be flagged)
