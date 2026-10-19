# Anti-Slop — AI Code Quality Linter

**Anti-Slop** is an opinionated, context-aware code quality linter for modern software and frontend engineering. It detects fragile implementations, AI patchwork, accessibility issues, empty functionality, and generic template patterns commonly introduced by AI coding agents.

---

## What Anti-Slop Is & Is Not

### What it is
- A **quality, robustness, and architecture linter** that detects concrete engineering anti-patterns.
- An AST-powered analyzer that provides evidence-backed explanations and safe Quick Fixes.
- A context-aware system that respects project baselines, naming conventions, and design tokens.

### What it is NOT
- **It is NOT an AI detector.** It never attempts to determine whether code was authored by a human or an AI.
- It does not emit diagnostics like *"AI generated code detected"*. Instead, it reports specific engineering flaws: *"Exception is silently swallowed. The catch block discards the error and provides no recovery or logging."*
- It does **not** ban popular technologies (e.g. Tailwind, React, Lucide, cards, rounded corners). Technologies become problematic only when misused without purpose or in violation of project invariants.

---

## Key Features

1. **Native VS Code Diagnostics**: Underlines real problems directly in the editor with configurable severity thresholds (`blocker`, `error`, `warning`, `suggestion`, `info`).
2. **Safe Quick Fixes**: Deterministic, 1-click code transformations (e.g. replacing `: any` with `: unknown`, inserting error logging in swallowed catches).
3. **Evidence-Backed Findings**: Every diagnostic answers:
   - *What was found?*
   - *Where was it found?*
   - *Why does it matter?*
   - *How confident is the rule?*
   - *What should be changed?*
4. **Performance Instrumentation**: Sub-millisecond incremental scanning with AST caching and debounced fast-path analysis.
5. **Noise Reduction via Clusters**: Weak signals are grouped into multi-signal composites (e.g. `AS-001 Generic AI SaaS Pattern`) rather than generating dozens of noisy individual warnings.

---

## Implemented High-Confidence Rules (Phase 1)

| Rule ID | Title | Category | Severity | Quick Fix |
|---|---|---|---|---|
| `AP-008` | Silent Exception Swallowing | Patchwork | Warning | Safe (Log / Propagate) |
| `AP-014` | Unsafe Any Escape Hatch | Patchwork | Warning | Safe (Replace with `unknown`) |
| `FN-015` | Clickable Non-Interactive Element | Functionality | Warning | Assisted (`role="button" tabIndex={0}`) |
| `AS-001` | Generic AI SaaS Pattern (POC Cluster) | Cluster | Suggestion | Refactor template composition |

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

Anti-Slop is configured via standard VS Code settings or `.vscode/settings.json`:

```json
{
  "antiSlop.enabled": true,
  "antiSlop.severity": "warning",
  "antiSlop.scanOnSave": true,
  "antiSlop.scanOnChange": true,
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

Suppress rules with familiar comments:

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

Access these commands from the VS Code Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- **Anti-Slop: Scan Current File** — Run an immediate on-demand analysis of the active document.
- **Anti-Slop: Scan Workspace** — Scan all project source files with progress reporting.
- **Anti-Slop: Show Report** — Display an interactive HTML report of findings and performance metrics.
- **Anti-Slop: Explain Finding** — Show deep contextual evidence and recommendations.
- **Anti-Slop: Ignore Rule** — Disable a rule in workspace settings from a quick pick list.
- **Anti-Slop: Reset Suppressions** — Reset all workspace suppressions.

---

## Architecture

Anti-Slop decouples the VS Code presentation layer from the core rule engine:

```
anti-slop/
├── apps/
│   └── vscode-extension/    # Thin VS Code adapter
├── packages/
│   ├── core/                # Types, findings, scoring, baseline
│   ├── parser/              # TypeScript Compiler AST parser + AST cache
│   ├── config/              # Configuration & comment suppression manager
│   └── rule-engine/         # RuleRegistry, engine, rules & clusters
├── tests/                   # Fixtures & automated test suites
└── docs/                    # Architecture & rule authoring specifications
```

See [docs/architecture.md](file:///docs/architecture.md) and [docs/rule-authoring.md](file:///docs/rule-authoring.md) for comprehensive guides.
