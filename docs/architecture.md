# Anti-Slop Architecture & Technical Design

## Overview

**Anti-Slop** is an opinionated, context-aware code quality linter designed to detect fragile engineering decisions, AI patchwork, accessibility issues, and template UI patterns in modern software codebases.

Crucially, **Anti-Slop is NOT an AI detector**. It measures **code quality, structural invariants, and engineering soundness**, never authorship.

```
                    ┌──────────────────────────┐
                    │    VS Code Extension     │  (Thin Adapter)
                    │  Diagnostics / QuickFix  │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │       Rule Engine        │  (RuleRegistry & Coordinator)
                    │    Clusters & Filters    │
                    └──────┬───────┬───────┬───┘
                           │       │       │
       ┌───────────────────┘       │       └───────────────────┐
       ▼                           ▼                           ▼
┌──────────────┐          ┌─────────────────┐         ┌─────────────────┐
│ AST Parser   │          │ Configuration   │         │ Core & Context  │
│ (TS Compiler │          │ & Suppressions  │         │ Baseline, Types │
│  + AST Cache)│          │ Manager         │         │ & Performance   │
└──────────────┘          └─────────────────┘         └─────────────────┘
```

---

## Monorepo Layout

The repository is organized as an npm workspace monorepo:

```
anti-slop/
├── apps/
│   └── vscode-extension/         # Thin VS Code extension host adapter
│       ├── src/
│       │   ├── extension.ts      # Activation / lifecycle
│       │   ├── diagnostics/      # DiagnosticCollectionAdapter (Finding -> vscode.Diagnostic)
│       │   ├── code-actions/     # Quick Fixes (Safe & Assisted) + inline suppressions
│       │   ├── watcher/          # Incremental debounced document watcher
│       │   ├── configuration/    # VS Code settings synchronization
│       │   └── commands/         # Palette commands (scan file, scan workspace, report)
│       └── package.json
│
├── packages/
│   ├── core/                     # Core domain contracts and primitives
│   │   ├── src/
│   │   │   ├── types/            # Finding, Rule, Severity, Evidence, FixDescriptor, Location
│   │   │   ├── scoring/          # Aggregate confidence scoring
│   │   │   ├── evidence/         # AST/Type/Heuristic evidence factories
│   │   │   ├── context/          # ProjectContext & ProjectBaseline detectors
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
│       │   ├── engine/           # RuleEngine (orchestrator)
│       │   ├── rules/            # Built-in high-confidence rules
│       │   └── clusters/         # Multi-signal composite clusters (e.g. AS-001)
│       └── package.json
│
├── tests/
│   ├── fixtures/                 # Fixtures (should-flag, should-not-flag, edge-case, false-positive)
│   ├── rules/                    # Rule unit tests
│   └── integration/              # Engine, suppressions, and end-to-end integration tests
│
└── docs/                         # Architecture, authoring, and rule specifications
```

---

## Core Principles & Design Invariants

1. **Decoupled Engine**: The core analyzer and rule engine have **zero dependencies on the VS Code API**. The entire engine can run in Node, CLI, CI/CD, or web workers.
2. **AST-Based Analysis**: Avoid fragile regular expressions. All syntactic and structural inspections use TypeScript AST nodes with accurate source spans.
3. **Evidence-Driven Diagnostics**: Every diagnostic provides:
   - What was found
   - Where it was found (exact source span)
   - Why it matters
   - Confidence score ($0.0 - 1.0$)
   - Recommended remedy
   - Safe/Assisted Quick Fix
4. **Performance by Default**:
   - Fast path: incremental debounced scan on document edits.
   - AST cache with content hashing to avoid redundant parsing.
   - Sub-millisecond rule execution.
   - Built-in `PerformanceTracker` recording parse times, rule times, and cache hit ratios.
5. **False Positive Mitigation**: Rules explicitly account for intentional developer escapes, external library interop, and valid patterns before emitting findings.
