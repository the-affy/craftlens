# Manual Audit Levels & Continuous Auto Audit

CraftLens balances **continuous, non-intrusive background review** during typing with **deep, rigorous audits** when preparing for milestones and pull request merges.

---

## The Four Manual Audit Levels

Every CraftLens rule declares a `minimumAuditLevel` attribute:
```ts
minimumAuditLevel: 'easy' | 'moderate' | 'hard' | 'strict';
```
When an audit is executed, only rules whose minimum audit level is satisfied by the configured intensity will trigger.

| Level | Rank | Focus Area | Noise Tolerance | Example Rules |
|---|---|---|---|---|
| **Easy** | 1 | Obvious runtime bugs, raw exceptions, broken accessibility, exposed credentials | Near-zero false positives allowed | `AP-008` (Catch swallowing), `AX-016` (Unlabeled icon button), `SEC-001` |
| **Moderate** *(Default)* | 2 | Balanced review: Architecture, component duplication, state complexity, UX flaws, and primary layout hierarchy | Recommended default for pair programming and daily work | `CX-013` (Component reuse), `VH-007` (Multiple primary CTAs), `CP-007` (Excessive cards) |
| **Hard** | 3 | Deeper inspection: Visual genericity, intent debt, design-system drift, and weak architectural smells | Suitable for feature completion and team code reviews | `ID-001` (Decorative noise), `ID-005` (Contextless metrics), `VH-008` (Typography hierarchy) |
| **Strict** | 4 | Rigorous senior engineering & design system sign-off. Exhaustive inspection across contracts, edge cases, and fine visual tokens | Strictest standard before shipping to production | Full coverage across all 16+ built-in rules, composite clusters, and custom project rules |

---

## Auto Audit vs Manual Audit

| Mode | Trigger | Scope | Target Level | UX Presentation |
|---|---|---|---|---|
| **Continuous Auto Audit** | Debounced document edit (300ms) or file save | Changed file + active project context | Easy → Moderate | Quiet inline CodeLens, Hover, and living Master Checklist sync |
| **Manual Audit** | Command palette: `CraftLens: Run Audit` | Selected File or Entire Workspace | User selects: Easy, Moderate, Hard, or Strict | Progress notification, complete diagnostic list, and Master Checklist refresh |

### Why Auto Audit is Not Strict by Default
Running Strict audit on every single keystroke would flood the editor with premature warnings while a developer or AI assistant is mid-refactor. Auto Audit prioritizes **high speed (<20ms execution), high confidence, and low noise**. When ready for a deep pass, developers invoke Manual Audit at Hard or Strict depth.
