# CraftLens Architecture & Technical Design

## Overview

**CraftLens** is an opinionated, context-aware continuous code quality reviewer designed to detect fragile engineering decisions, AI patchwork, accessibility issues, and template UI patterns in modern software codebases.

Crucially, **CraftLens is NOT an AI detector**. It measures **code quality, structural invariants, and engineering soundness**, never authorship.

---

## Continuous Review & Master Audit Architecture

```
Developer / AI changes code
        ↓
CraftLens watches the change (DocumentWatcher, debounced)
        ↓
Analyzes changed code + computes structural fingerprints
        ↓
Displays inline suggestions & diagnostics (CodeLens, Hover, Problems)
        ↓
Synchronizes Master Audit Checklist (.craftlens/checklist.md & audit.json)
        ↓
Developer fixes the issue
        ↓
CraftLens re-checks automatically & flips checklist item to [x] PASSED
```

```
                 CraftLens Core Engine
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
    Inline              Change              Master
 Suggestions            Review             Checklist
(CodeLens/Hover)    (Recent Diff)     (.craftlens/checklist.md)
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                     Manual Audit
          Easy → Moderate → Hard → Strict
```

---

## Monorepo Layout

```
craftlens/
├── apps/
│   └── vscode-extension/         # Thin VS Code extension host adapter
│       ├── src/
│       │   ├── extension.ts      # Activation / lifecycle & custom rules watcher
│       │   ├── diagnostics/      # DiagnosticCollectionAdapter (Finding -> vscode.Diagnostic)
│       │   ├── code-actions/     # Quick Fixes (Safe & Assisted) + supported-action filtering
│       │   ├── hover/            # HoverProvider (diagnosis, rationale, recommendations, alternatives)
│       │   ├── codelens/         # CodeLensProvider (quiet inline Suggest Better Design & Fix)
│       │   ├── status/           # CraftLensStatusBar (real-time health score)
│       │   ├── watcher/          # Incremental debounced continuous audit watcher
│       │   ├── configuration/    # VS Code settings synchronization
│       │   └── commands/         # Palette commands (Suggest Design, Preview Fix, Custom Rules wizard)
│       └── package.json
│
├── packages/
│   ├── core/                     # Core domain contracts, models & storage
│   │   ├── src/
│   │   │   ├── types/            # Finding, Rule, Fix, Intent, CustomRule, Checklist
│   │   │   ├── scoring/          # Aggregate confidence scoring
│   │   │   ├── evidence/         # AST/Type/CSS/Regex evidence factories
│   │   │   ├── context/          # ProjectContext, DesignSystem & DesignBaseline detectors
│   │   │   ├── checklist/        # Checklist generator, markdown formatter & storage
│   │   │   └── analyzer/         # PerformanceTracker & metric recording
│   │   └── package.json
│   │
│   ├── design-intelligence/      # Design reasoning & actionable UX recommendations
│   │   ├── src/
│   │   │   ├── intent/           # Page/component intent detector (dashboard, marketing, form, etc.)
│   │   │   ├── analyzer/         # CSS & token analyzer (non-standard spacing/radii, color tokens)
│   │   │   ├── hierarchy/        # Action & surface hierarchy analyzers (cards, CTAs, headings)
│   │   │   ├── patterns/         # Correlated multi-signal pattern matcher (no simplistic bans)
│   │   │   ├── recommendations/  # Structured directions with 2-3 alternatives & tradeoffs
│   │   │   └── fixes/            # DesignFix and ProposedChange generators (before/after previews)
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
│   │   │   ├── config.ts         # CraftLensConfig & merge logic
│   │   │   └── suppression.ts    # Inline & block comment suppression parser
│   │   └── package.json
│   │
│   └── rule-engine/              # Rule coordinator & implementations
│       ├── src/
│       │   ├── registry/         # RuleRegistry (built-in + custom rules unified)
│       │   ├── engine/           # RuleEngine (orchestrator with audit level filters)
│       │   ├── custom/           # CustomRuleParser, Evaluator, Loader & ProjectRuleGenerator
│       │   ├── rules/            # Built-in high-confidence rules (hierarchy, consistency, intent, code)
│       │   └── clusters/         # Multi-signal composite clusters (e.g. AS-001)
│       └── package.json
│
├── tests/
│   ├── fixtures/                 # Fixtures (should-flag, should-not-flag, edge-case, false-positive)
│   ├── rules/                    # Rule unit tests
│   └── integration/              # Engine, custom rules, design-intelligence, checklist, audit levels
│
└── docs/                         # Architecture, custom-rules, design-intelligence, audit-levels, checklist
```

---

## Unified Rule & Finding Engine

Custom rules and built-in rules share the exact same runtime pipeline:

```
Built-in Rules (TypeScript) ──────┐
                                   ├──► Rule Engine ──► Finding Engine ──┐
Custom Rules (YAML / JSON)  ──────┘                                      │
                                                                         ▼
                                                     ┌─────────────────────────────────┐
                                                     │ • Inline Suggestions (CodeLens) │
                                                     │ • Rich Hover Recommendations    │
                                                     │ • Side-by-Side Diff Previews    │
                                                     │ • Quick Fixes (Safe & Assisted) │
                                                     │ • Problems View Diagnostics     │
                                                     │ • Master Checklist (.craftlens)  │
                                                     │ • Change Review & Audit History │
                                                     └─────────────────────────────────┘
```

---

## Three Levels of Design Response

Every finding separates design evaluation into three distinct layers:

1. **Diagnosis ("What is wrong?"):**
   Concrete issue statement with AST/CSS evidence (e.g. *"The page has six equally weighted primary actions"*).
2. **Recommendation ("What should change?"):**
   Design direction and tradeoffs (e.g. *"Establish one primary action and visually subordinate remaining actions"*).
3. **Implementation ("How can it be changed?"):**
   Concrete code transformation or assisted refactoring (e.g. *"Convert secondary buttons to variant='secondary' and reduce visual weight"*).

---

## Fix Safety Classification

- **`safe`**: Low-risk deterministic transformations (zero chance of altering business logic, auth, or data integrity). Can be applied automatically.
- **`assisted`**: Structured code modifications provided as side-by-side diff previews requiring developer confirmation.
- **`manual`**: Architectural or subjective design directions where automated code rewriting would risk breaking intent. CraftLens provides structured guidance and alternatives instead of fake fixes.

---

## Persistent Project Storage (`.craftlens/`)

The audit state persists across developer sessions:

```
.craftlens/
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
