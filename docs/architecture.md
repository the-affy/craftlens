# Anti-Slop Architecture & Technical Design

## Overview

**Anti-Slop** is an opinionated, context-aware continuous code quality reviewer designed to detect fragile engineering decisions, AI patchwork, accessibility issues, and template UI patterns in modern software codebases.

Crucially, **Anti-Slop is NOT an AI detector**. It measures **code quality, structural invariants, and engineering soundness**, never authorship.

---

## Continuous Review & Master Audit Architecture

```
Developer / AI changes code
        ↓
Anti-Slop watches the change (DocumentWatcher, debounced)
        ↓
Analyzes changed code + computes structural fingerprints
        ↓
Displays inline suggestions & diagnostics (CodeLens, Hover, Problems)
        ↓
Synchronizes Master Audit Checklist (.antislop/checklist.md & audit.json)
        ↓
Developer fixes the issue
        ↓
Anti-Slop re-checks automatically & flips checklist item to [x] PASSED
```

```
                 Anti-Slop Core Engine
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
    Inline              Change              Master
 Suggestions            Review             Checklist
(CodeLens/Hover)    (Recent Diff)     (.antislop/checklist.md)
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                     Manual Audit
          Easy → Moderate → Hard → Strict
```

---

## Monorepo Layout

```
anti-slop/
├── apps/
│   └── vscode-extension/         # Thin VS Code extension host adapter
│       ├── src/
│       │   ├── extension.ts      # Activation / lifecycle
│       │   ├── diagnostics/      # DiagnosticCollectionAdapter (Finding -> vscode.Diagnostic)
│       │   ├── code-actions/     # Quick Fixes (Safe & Assisted) + inline suppressions
│       │   ├── hover/            # HoverProvider (rationale, evidence, recommendation)
│       │   ├── codelens/         # CodeLensProvider (quiet inline fix & explain actions)
│       │   ├── status/           # AntiSlopStatusBar (real-time health score)
│       │   ├── watcher/          # Incremental debounced continuous audit watcher
│       │   ├── configuration/    # VS Code settings synchronization
│       │   └── commands/         # Palette commands (run audit, open checklist, report)
│       └── package.json
│
├── packages/
│   ├── core/                     # Core domain contracts, models & storage
│   │   ├── src/
│   │   │   ├── types/            # Finding, Rule, Severity, AuditLevel, Checklist, History
│   │   │   ├── scoring/          # Aggregate confidence scoring
│   │   │   ├── evidence/         # AST/Type/Heuristic evidence factories
│   │   │   ├── context/          # ProjectContext & ProjectBaseline detectors
│   │   │   ├── checklist/        # Checklist generator, markdown formatter & storage
│   │   │   └── analyzer/         # PerformanceTracker & metric recording
│   │   └── package.json
│   │
│   ├── parser/                   # AST parsing and caching abstraction
│   │   ├── src/
│   │   │   ├── typescript/       # TypeScript Compiler API wrapper & node visitors
│   │   │   └── typescript/cache  # In-memory AST cache with content-hash validation
│   │   └── package.json
│   │
│   ├── config/                   # Configuration schemas & comment suppressions
│   │   ├── src/
│   │   │   ├── config.ts         # AntiSlopConfig & merge logic
│   │   │   └── suppression.ts    # Inline & block comment suppression parser
│   │   └── package.json
│   │
│   └── rule-engine/              # Rule coordinator & implementations
│       ├── src/
│       │   ├── registry/         # RuleRegistry
│       │   ├── engine/           # RuleEngine (orchestrator with audit level filters)
│       │   ├── rules/            # Built-in high-confidence rules
│       │   └── clusters/         # Multi-signal composite clusters (e.g. AS-001)
│       └── package.json
│
├── tests/
│   ├── fixtures/                 # Fixtures (should-flag, should-not-flag, edge-case, false-positive)
│   ├── rules/                    # Rule unit tests
│   └── integration/              # Engine, suppressions, checklist, and audit level tests
│
└── docs/                         # Architecture, authoring, and rule specifications
```

---

## Persistent Project Storage (`.antislop/`)

The audit state persists across developer sessions:

```
.antislop/
├── checklist.md        # Human-readable living checklist document
├── audit.json          # Machine-readable current audit state and item statuses
├── history.json        # Historical audit log tracking quality trends over time
└── change-review.md    # Summary of newly introduced vs resolved findings
```

---

## The Four Manual Audit Levels

| Level | Sensitivity | Focus | Target Use Case |
|---|---|---|---|
| **Easy** | High confidence only | Critical runtime crashes, exposed credentials, broken a11y, dead code | Quick sanity check with near-zero false positive tolerance |
| **Moderate** | Balanced review (Default) | Code duplication, patchwork, unnecessary dependencies, state complexity, UX flaws | Day-to-day pair programming and active development |
| **Hard** | Deep analysis | Weaker architectural smells, visual genericity, template patterns, intent debt | Milestone reviews and PR reviews |
| **Strict** | Production-grade review | Exhaustive inspection of state machines, edge cases, contracts, design tokens | Senior engineering sign-off before shipping to production |
