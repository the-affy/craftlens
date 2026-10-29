# Changelog

All notable changes to CraftLens are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-30

### Changed
- Standardized open-source repository structure and metadata for canonical GitHub release.
- Updated repository URLs, issue tracker, and project documentation to `the-affy/craftlens`.
- Streamlined extension packaging, clean build scripts, and automated artifact validation.

## [1.0.0] - 2026-10-29

### Added
- **Initial Public Release of CraftLens**: A high-precision, context-aware quality linter and pre-release assurance engine for modern software.
- **Continuous Auto-Audit & Static Analysis**:
  - Multi-language AST-based static rule execution across TypeScript, JavaScript, CSS/SCSS, HTML, Vue, and Svelte.
  - Non-intrusive inline CodeLens and rich hover diagnostic hints (`Fix`, `Explain`, `Ignore`).
  - Four configurable audit sensitivity levels: `Easy`, `Moderate` (recommended default), `Hard`, and `Strict`.
- **QA, Code Review & Release Assurance Engine**:
  - 13 specialized built-in analyzers covering TypeScript boundaries, Extension Manifest health, Command Registry completeness, Runtime Safety & leak prevention, Webview CSP & keyboard accessibility, State Consistency, Fix Engine integrity, Dependency supply chain, Security (secrets, command injection, HTML injection), Code Quality (swallowed exceptions, NaN comparisons), Test Suite verification, Packaging boundaries, and Core Architecture contracts.
  - Multi-pass risk-based code reviewer with adversarial verification and confidence scoring.
  - Deterministic Release Gate evaluating `RELEASE PASS`, `RELEASE PASS WITH WARNINGS`, or `RELEASE BLOCKED`.
  - Self-QA and dogfooding commands (`craftlens.runSelfQA`, `craftlens.runQA`, `craftlens.verifyRelease`).
- **Universal Safe Fix & Regression Validation Pipeline**:
  - Multi-stage validation lifecycle: capability resolution → patch generation → pre-write AST validation → real diff preview → user review → atomic disk application → post-write compiler validation → targeted re-analysis.
  - Guaranteed automatic rollback if any validation stage or regression check fails.
- **Living Project Ledgers (`.craftlens/`)**:
  - Canonical project artifacts: `issues.md` (authoritative issue registry), `suggestions.md` (architectural recommendations), `changes.md` (immutable user change history), and `checklist.md` (Master Audit Checklist).
- **Interactive Sidebar & Bento Project Overview**:
  - Sidebar panel with views for Audit findings, Checklist status, Custom Skills, Rule explorer, and Project Metrics.
  - Interactive Project Overview dashboard with project health KPI metrics, multi-location issue navigation, live side-by-side diff preview, and dedicated QA & Release assurance tab.
- **Custom Skills & Rules**:
  - Extensible skill management with local and GitHub skill importers, priority-ranked overrides, and workspace-level custom rule authoring.
- **Privacy & Security First Architecture**:
  - 100% local-first execution with zero external network dependencies, zero telemetry, and secret storage backed by native VS Code SecretStorage.

