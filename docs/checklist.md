# CraftLens Master Audit Checklist & Change Review

## 1. Overview

CraftLens maintains a persistent, project-specific living checklist that reflects the actual verification status of your codebase against engineering, architectural, accessibility, UX, and design standards.

Rather than only populating a transient editor panel, CraftLens generates and updates a human-readable and git-trackable master checklist:
- **Master Checklist Document**: `.craftlens/checklist.md`
- **Machine-Readable State**: `.craftlens/audit.json`
- **Quality Trend Log**: `.craftlens/history.json`
- **Change Review Summary**: `.craftlens/change-review.md`

CraftLens continuously updates this checklist as code changes occur, whether authored by humans or AI coding assistants. When an issue is resolved, its status immediately transitions from failed/warning to passed.

---

## 2. Checklist States

Every checklist item tracks a discrete verification checkpoint and can exist in one of seven standard states:

| State | Checkbox / Badge | Description |
|---|---|---|
| `passed` | `- [x]` | Invariant verified with zero active violations or findings. |
| `failed` | `- [ ]` ❌ | Blocker or critical error detected in the project scope. |
| `warning` | `- [ ]` ⚠ | Moderate or hard warning finding detected; requires developer attention. |
| `pending` | `- [ ]` ⏳ | Verification scheduled or pending evaluation. |
| `needs-review` | `- [ ]` 🔍 | Assisted finding or pattern cluster requiring human sign-off. |
| `ignored` | `- [~]` 🚫 | Rule suppressed via inline comments or explicitly marked "Not a problem". |
| `not-applicable` | `- [ ]` (N/A) | Checkpoint is irrelevant for the current project context (e.g. Next.js image rules on a pure Node CLI). |

---

## 3. Master Checklist Lifecycle

```
             ┌──────────────────────────────┐
             │       Code Modification      │
             │   (Human / AI Assistant)     │
             └──────────────┬───────────────┘
                            │
                            ▼
             ┌──────────────────────────────┐
             │    Document Watcher Debounce │
             │    (Live / Change Audit)     │
             └──────────────┬───────────────┘
                            │
                            ▼
             ┌──────────────────────────────┐
             │  Rule Engine & Custom Rules  │
             │ (Diagnostics & Evidence)     │
             └──────────────┬───────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌───────────────────┐       ┌───────────────────┐
    │  Findings Found   │       │ Finding Resolved  │
    └─────────┬─────────┘       └─────────┬─────────┘
              │                           │
              ▼                           ▼
    Update Item to:             Update Item to:
    [ ] ⚠ / [ ] ❌               [x] Passed
              │                           │
              └─────────────┬─────────────┘
                            ▼
             ┌──────────────────────────────┐
             │    Sync .craftlens/           │
             │    - checklist.md            │
             │    - audit.json              │
             │    - change-review.md        │
             └──────────────────────────────┘
```

### Stale State Eviction
CraftLens never leaves stale failures behind. As soon as a developer or AI assistant amends the code (for example, applying a proposed fix or removing redundant card nesting), the engine re-evaluates the scope, clears the diagnostics, and marks the checklist item as passed.

---

## 4. Master Checklist Format (`.craftlens/checklist.md`)

```markdown
# CraftLens Master Audit

Project: `craftlens`
Audit Level: `moderate`
Last Updated: 2026-10-19T14:45:00.000Z
Status: NEEDS ATTENTION (3 warnings, 0 blockers)

## Code Quality
- [x] No unused dependencies
- [x] No dead imports
- [x] Explicit error handling (AP-008)
- [ ] ⚠ Component responsibility overload

## Architecture
- [x] Existing services reused
- [x] Correct abstraction boundaries
- [ ] ⚠ Duplicate API client

## Accessibility
- [x] Form labels present
- [x] Image alternative text
- [ ] ⚠ Icon button accessible names (AX-016)

## UX & Interaction
- [x] Loading states handled
- [ ] ⚠ Call-to-action without outcome (ID-004)
- [x] Non-interactive elements not clickable (FN-015)

## Visual Design & Hierarchy
- [x] Project design baseline followed
- [ ] ⚠ Single primary CTA hierarchy (VH-007)
- [ ] ⚠ Excessive surface nesting (CP-007)
- [x] Spacing scale compliance (CX-004)

## Project Consistency
- [x] Existing Button component reused (CX-013)
- [x] Design token color adherence
```

---

## 5. Change Review (`.craftlens/change-review.md`)

When working with AI coding assistants, code is often updated in burst edits across multiple files. CraftLens computes a focused **Change Review** specific to the latest changeset:

```markdown
# CraftLens Change Review

**Trigger:** Save (`src/dashboard/AnalyticsOverview.tsx`)
**Audit Depth:** Moderate
**Review Status:** NEEDS ATTENTION

### Files Changed
- `src/dashboard/AnalyticsOverview.tsx`
- `src/components/MetricCard.tsx`

### Review Checks
- [x] Project component conventions (Button reused)
- [x] Loading state present
- [ ] ⚠ Primary action hierarchy (VH-007): 2 primary buttons detected
- [ ] ⚠ Metric without decision context (ID-005): 4 isolated statistics
- [x] Keyboard accessibility
- [x] No hardcoded credentials
- [x] Valid design token spacing (CX-004)

### Recommended Action
Run `CraftLens: Suggest Better Design` on `AnalyticsOverview.tsx` to group secondary metrics and designate a single primary CTA.
```

---

## 6. Audit History & Quality Trends (`.craftlens/history.json`)

CraftLens stores local JSON history snapshots to track quality improvements over time:

```json
[
  {
    "auditId": 14,
    "timestamp": "2026-10-19T14:45:00.000Z",
    "level": "moderate",
    "summary": {
      "blockers": 0,
      "errors": 0,
      "warnings": 3,
      "suggestions": 4,
      "resolvedSinceLast": 5,
      "newSinceLast": 1
    }
  }
]
```

This data powers the VS Code Status Bar and progress reports, allowing teams to verify that AI code generation is improving software quality rather than accumulating technical debt.
