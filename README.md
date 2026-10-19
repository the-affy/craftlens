# Anti-Slop — AI Code Quality Linter & Continuous Reviewer

**Anti-Slop** is an opinionated, context-aware continuous code quality reviewer for modern software engineering. It detects fragile implementations, AI patchwork, accessibility issues, empty functionality, and generic template patterns commonly introduced by AI coding agents.

Rather than waiting for manual scans or only populating the Problems panel, Anti-Slop acts as a **continuous software-quality reviewer** looking over the shoulder of your AI coding assistant.

---

## What Anti-Slop Is & Is Not

### What it is
- A **continuous quality, robustness, and architecture reviewer** that detects concrete engineering anti-patterns as code changes.
- An AST-powered analyzer that maintains a persistent **Master Audit Checklist** (`.antislop/checklist.md`).
- A context-aware system that provides quiet **inline CodeLens**, **Hover explanations**, and **safe Quick Fixes**.

### What it is NOT
- **It is NOT an AI detector.** It never attempts to determine whether code was authored by a human or an AI.
- It does not emit diagnostics like *"AI generated code detected"*. Instead, it reports specific engineering flaws: *"Exception is silently swallowed. The catch block discards the error and provides no recovery or logging."*
- It does **not** ban popular technologies (e.g. Tailwind, React, Lucide, cards, rounded corners). Technologies become problematic only when misused without purpose or in violation of project invariants.

---

## The Continuous Review Workflow

```
Developer / AI changes code
        ↓
Anti-Slop watches the change (DocumentWatcher, debounced)
        ↓
"Reviewing changes..."
        ↓
Inline CodeLens and Hover suggestions appear beside affected code
        ↓
Master Audit Checklist (.antislop/checklist.md) automatically updates
        ↓
Developer fixes the issue
        ↓
Anti-Slop re-checks automatically & flips checklist item to [x] PASSED
```

---

## Key Features

1. **Continuous Auto Audit (Default)**: Automatically runs incremental checks whenever code changes, tracking newly introduced issues vs resolved issues.
2. **Persistent Master Audit Checklist (`.antislop/checklist.md`)**: A living, human-readable markdown document in your repository that infers what features actually exist in your project and tracks requirements:
   - `[x] PASSED`
   - `[ ] WARNING`
   - `[ ] FAILED`
   - `[-] NOT APPLICABLE`
3. **Four Manual Audit Levels**:
   - 🟢 **Easy**: High-confidence critical bugs, security vulnerabilities, and raw crashes.
   - 🟡 **Moderate (Default)**: Balanced code, UX, architecture, and patchwork review.
   - 🟠 **Hard**: Deeper architectural smells, visual genericity, and intent debt.
   - 🔴 **Strict**: Rigorous production / senior engineering review.
4. **Inline CodeLens & Rich Hover**: Displays clean, non-intrusive action buttons directly in the editor (`Fix`, `Explain`, `Ignore`).
5. **Change Review Summaries**: Generates a concise quality diff summarizing lines changed, newly introduced findings, and pillar scores (Code, Architecture, UX, A11y, Security, AI-Slop).

---

## Active Rules

| Rule ID | Title | Category | Severity | Min Audit Level | Quick Fix |
|---|---|---|---|---|---|
| `AP-008` | Silent Exception Swallowing | Patchwork | Warning | Easy | Safe (Log / Propagate) |
| `AP-014` | Unsafe Any Escape Hatch | Patchwork | Warning | Moderate | Safe (Replace with `unknown`) |
| `FN-015` | Clickable Non-Interactive Element | Functionality | Warning | Easy | Assisted (`role="button" tabIndex={0}`) |
| `AX-016` | Icon Button Without Accessible Name | Accessibility | Error | Easy | Assisted (`aria-label="Action"`) |
| `PH-011` | Lorem Ipsum Placeholder in UI | Placeholder | Warning | Easy | Assisted (Product Copy) |
| `CSS-005`| Magic Z-Index Escalation | CSS | Warning | Moderate | Assisted (Layer Scale) |
| `AS-001` | Generic AI SaaS Pattern | Cluster | Suggestion | Hard | Multi-signal Refactor |

---

## Persistent Project State (`.antislop/`)

Anti-Slop automatically creates and maintains a local `.antislop/` directory:

```
.antislop/
├── checklist.md        # Living checklist markdown document
├── audit.json          # Machine-readable current audit state
├── history.json        # Historical audit records tracking quality trends
└── change-review.md    # Summary of most recent code change impact
```

---

## Installation & Development Setup

### Prerequisites
- Node.js $\ge 20$
- npm $\ge 10$

### Setup
```bash
# Clone the repository
git clone https://github.com/javra/antislop.git
cd antislop

# Install dependencies across all workspaces
npm install

# Run the automated test suite
npm test

# Typecheck the monorepo
npm run typecheck

# Build the VS Code extension bundle
npm run --workspace=apps/vscode-extension build
```

---

## Configuration

Configure Anti-Slop in `.vscode/settings.json`:

```json
{
  "antiSlop.enabled": true,
  "antiSlop.autoAudit": true,
  "antiSlop.auditLevel": "moderate",
  "antiSlop.enableCodeLens": true,
  "antiSlop.persistAudit": true,
  "antiSlop.severity": "warning",
  "antiSlop.maxDiagnosticsPerFile": 50,
  "antiSlop.rules": {
    "AP-008": {
      "enabled": true,
      "severity": "warning"
    },
    "AP-014": {
      "enabled": true,
      "severity": "suggestion"
    }
  }
}
```

### Inline Suppressions

```typescript
// Suppress next line for a specific rule
// anti-slop-disable-next-line AP-008
try { riskyOperation(); } catch {}

// Suppress current line
try { cleanup(); } catch {} // anti-slop-disable-line AP-008

// Suppress entire file
/* anti-slop-disable-file */
```

---

## Commands

Access these from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- **Anti-Slop: Run Audit (Choose Intensity Level)** — Choose between Easy, Moderate, Hard, or Strict, and select scope (Workspace or Current File).
- **Anti-Slop: Open Master Audit Checklist** — Opens `.antislop/checklist.md` side-by-side.
- **Anti-Slop: Scan Current File** — Run an immediate on-demand analysis of the active document.
- **Anti-Slop: Scan Workspace** — Scan all project source files with progress reporting.
- **Anti-Slop: Show Report** — Display an interactive HTML report of findings and performance metrics.
- **Anti-Slop: Explain Finding** — Show deep contextual evidence and recommendations.
- **Anti-Slop: Ignore Rule** — Disable a rule in workspace settings from a quick pick list.
- **Anti-Slop: Reset Suppressions** — Reset all workspace suppressions.
