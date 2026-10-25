# CraftLens

**A second pair of eyes for AI-generated software.**  
*Find problems, understand why they matter, and improve them.*

---

## Why CraftLens Exists

AI coding assistants write code faster than ever, but speed often comes at the cost of craft. AI-generated interfaces frequently introduce subtle yet serious flaws:

* **Flat visual hierarchy**: Every element shouts with the same visual weight.
* **Accessibility oversights**: Icon-only buttons without accessible labels, missing ARIA tags, and insufficient contrast.
* **Generic boilerplate**: Monolithic components, duplicated styles, and placeholder UX copy.
* **Unconsidered edge cases**: Missing loading, empty, and error states.

CraftLens works alongside you as a senior engineer, product designer, and accessibility specialist. It reviews your code in real time, diagnoses root causes, explains the user and engineering impact, and offers contextual recommendations to refine your work.

---

## What CraftLens Reviews

| Domain | What We Inspect |
| :--- | :--- |
| **UI/UX & Visual Hierarchy** | Cluttered layouts, lack of primary focal points, identical card weights, inconsistent button styling, and layout thrashing. |
| **Accessibility (A11y)** | Missing ARIA attributes, unlabeled interactive icons, low color contrast, missing keyboard traps, and bad focus states. |
| **Content & Microcopy** | Generic button text ("Click Here", "Submit"), filler copy, missing empty state guidance, and confusing error messaging. |
| **Code Quality & Architecture** | Giant multi-hundred line components, deep prop drilling, redundant state management, and tightly coupled logic. |
| **Security & Secrets** | Hardcoded secrets, unescaped HTML injections, unsafe local storage usage, and unvalidated URLs. |
| **Performance** | Expensive inline functions, unoptimized image tags, unnecessary re-render triggers, and bloated dependencies. |

---

## Real-World Example

### The Problem
An AI assistant generates a 3-tier pricing section:
```tsx
<div className="pricing-grid">
  <div className="card"><h3>Starter</h3><p>$9/mo</p><button>Select</button></div>
  <div className="card"><h3>Pro</h3><p>$29/mo</p><button>Select</button></div>
  <div className="card"><h3>Enterprise</h3><p>$99/mo</p><button>Select</button></div>
</div>
```

### CraftLens Detection
* **Finding**: `ID-001 (Intentional Design)` — The three plans share identical visual weight, making the recommended tier ambiguous.
* **Why it matters**: Users must spend extra cognitive effort comparing options, reducing conversion and clarity.
* **Contextual Recommendation**: Keep the existing 3-card structure, but apply subtle elevation, an accent border, and a "Most Popular" badge to the Pro plan instead of rewriting the section from scratch.

---

## The Review → Fix → Review Workflow

1. **Scan**: Instant, non-intrusive diagnostics as you write code, save files, or run workspace audits.
2. **Understand**: Inspect findings in the VS Code Problems panel or the CraftLens interactive sidebar. Read clear explanations of *why* an issue matters.
3. **Contextual Recommendations**: Trigger **Suggest Better Design** to explore targeted alternatives tailored to your existing component patterns and design system.
4. **Side-by-Side Diff Preview**: Review proposed code modifications in a native diff editor before applying them.
5. **Living Checklist**: Automatically track progress across your workspace with the living `.craftlens/checklist.md` audit ledger.

---

## Interactive Sidebar

CraftLens features a comprehensive sidebar with five dedicated views:

* **Audit**: Filter and search findings by severity (`Blocker`, `Error`, `Warning`, `Suggestion`). Jump directly to source code ranges.
* **Checklist**: View an interactive master checklist organized by category with real-time pass/fail states.
* **Skills**: Activate specialized inspection workflows (e.g., Design Intelligence, Accessibility Deep Dive, UX Polish).
* **Rules**: Browse built-in and user-defined rules, toggle rules on/off, and inspect rationale.
* **Metrics**: Track overall quality scores, issue distributions, and resolution velocity.

---

## Commands

Access CraftLens commands via `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux):

* `CraftLens: Run Audit` — Run a complete audit with selectable sensitivity (Easy, Moderate, Hard, Strict).
* `CraftLens: Scan Current File` — Analyze the active document immediately.
* `CraftLens: Scan Workspace` — Run a full-workspace analysis.
* `CraftLens: Open Master Audit Checklist` — Open the persistent `.craftlens/checklist.md` document.
* `CraftLens: Suggest Better Design` — Generate contextual, pattern-aware UX and UI improvements.
* `CraftLens: Explain Finding` — Open detailed architecture rationale for the current diagnostic.
* `CraftLens: Create Custom Rule` — Launch the wizard to build workspace-specific declarative rules.
* `CraftLens: Show Report` — Display quality and compliance summary metrics.

---

## In-Code Suppressions

Suppress a rule on the next line when intentional:
```typescript
// craftlens-disable-next-line AX-016
<button><IconClose /></button>
```

Or record the rationale for team review:
```typescript
// craftlens-disable-next-line AX-016 -- reason: SVG contains title tag for screen readers
```

---

## Privacy & Security

* **100% Free**: No subscription gates, no login requirements, and no paywalls.
* **Local First**: Core rule evaluation and static analysis run entirely on your machine. Your source code never leaves your computer unless you explicitly configure an external AI provider (BYOK).
* **Zero Telemetry**: CraftLens does not track your keystrokes, personal details, or project content.

---

## License

CraftLens is open source software licensed under the [MIT License](LICENSE).
