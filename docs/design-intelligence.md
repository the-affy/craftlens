# Design Intelligence Subsystem

CraftLens's **Design Intelligence Engine** elevates the tool from a code linter into a continuous software and product design reviewer. It evaluates layout structure, visual hierarchy, intent, design system consistency, and interaction patterns directly from source code, AST, and CSS.

---

## Core Product Loop

```
WATCH (Continuous file watcher debounces code changes)
  ↓
UNDERSTAND (Infer page intent, detect design system & project baseline)
  ↓
DETECT (AST, CSS, layout hierarchy, and pattern correlation)
  ↓
EXPLAIN (Detailed diagnosis + why it matters to UX/engineering)
  ↓
RECOMMEND (Concrete suggested direction + 2–3 alternatives with tradeoffs)
  ↓
PROPOSE FIX (Safe, assisted, or manual code transformation)
  ↓
APPLY / PREVIEW (Side-by-side diff preview in VS Code or 1-click apply)
  ↓
RECHECK (Fast re-audit on document change)
  ↓
UPDATE CHECKLIST (Automatic synchronization of Master Checklist)
```

---

## Three Levels of Design Response

Every design and architectural finding distinguishes between three distinct layers:

1. **Diagnosis — What is wrong?**
   *Example:* The page has six equally weighted primary actions.
2. **Recommendation — What should change?**
   *Example:* Establish one primary action and visually subordinate the remaining actions.
3. **Implementation — How can it be changed?**
   *Example:* Convert secondary buttons to `variant="secondary"` or `variant="ghost"` and reduce their visual weight.

A design recommendation is not automatically an aggressive automated code rewrite. When automated transformation is safe or assisted, CraftLens provides a concrete diff preview. When the decision requires product discernment, CraftLens provides structured alternatives.

---

## Subsystem Architecture (`packages/design-intelligence`)

```
packages/design-intelligence/
├── analyzer/
│   ├── css-analyzer.ts              # Spacing, radius, colors, and gradient token extraction
│   └── jsx-structure-analyzer.ts    # Container nesting, grids, and button distribution
├── intent/
│   └── intent-detector.ts           # Surface classification (dashboard, marketing, form, etc.)
├── hierarchy/
│   ├── action-hierarchy.ts          # Action distribution and competing primary CTAs (VH-007)
│   └── surface-hierarchy.ts         # Card nesting (CP-008) and excessive identical cards (CP-007)
├── patterns/
│   └── pattern-matcher.ts           # Multi-factor contextual pattern correlation
├── recommendations/
│   └── recommendation-builder.ts    # Direction, alternatives, tradeoffs, and difficulty
└── fixes/
    └── fix-builder.ts               # Proposed changes with before/after diffs & safety levels
```

---

## Design Intent Abstraction

CraftLens infers what a page or component is trying to accomplish rather than applying blanket stylistic rules:

| Intent Category | Typical Indicators | Design Priorities |
|---|---|---|
| **Marketing** | `/marketing`, `/landing`, `/pricing`, `Hero`, `CTA` | High visual energy, prominent conversion CTAs, narrative hero layouts |
| **Dashboard** | `/dashboard`, `/analytics`, `/admin`, `Metric`, `Chart` | High data density, crisp contrast, rapid scannability, minimal decorative glow |
| **Form** | `<form>`, `useForm`, `FormField`, `onSubmit` | Accessible labels, logical tab order, primary submit vs cancel hierarchy |
| **Checkout** | `/checkout`, `/cart`, `/billing`, `/payment` | Zero distraction, transparent itemized pricing, single unambiguous primary CTA |
| **Authentication** | `/login`, `/auth`, `/signup`, `/register` | Single focused action, clear error states, high accessibility |
| **Settings** | `/settings`, `/preferences`, `/account` | Quiet secondary actions, grouped sections, persistent confirmation |
| **Documentation** | `/docs`, `/guide`, markdown, content | High typography contrast, scannable heading hierarchy, readability |

*Users can easily override or configure page intent in project settings.*

---

## Context-Aware Pattern Matching (No Arbitrary Rules)

CraftLens rejects simplistic rules such as *"purple = bad"*, *"cards = bad"*, or *"gradients = bad"*.

Instead, patterns are evaluated in **context**:

* **Uncorrelated Generic AI Template:** Flagged only when multiple independent markers align without brand token foundation:
  - Purple/indigo hero gradient **without** established purple brand token
  - Exaggerated floating translucent cards (`shadow-2xl backdrop-blur`)
  - Generic boilerplate CTA copy ("Transform your workflow with next-generation platform")
  - Centered hero layout with identical 3-card grid
* **Intentional Brand Design:** If a project configures purple in its design tokens (`brandColors: ["#7c3aed"]`), CraftLens recognizes it as an approved brand element and suppresses warnings.

---

## Actionable Suggestions & Multiple Design Alternatives

When a visual or UX finding is detected, CraftLens offers 2–3 practical alternatives with explicit tradeoffs and difficulty levels:

### Example: CP-007 (Excessive Card Usage)
* **Option A — Compact List** `[Easy]`: Best for dense information and tables.
* **Option B — Feature Hierarchy** `[Medium]`: Best when 1–2 items represent primary user goals.
* **Option C — Grouped Sections** `[Medium]`: Best when items belong to distinct categories.

Developers can click **[Show Alternatives]** or **[Suggest Better Design]** in VS Code to compare options and preview diffs before applying.
