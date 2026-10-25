# Custom User Rules & Rule Packs

CraftLens provides first-class support for project-local, user-defined rules. Developers can define custom architectural, brand, styling, and accessibility standards without modifying CraftLens's source code.

Custom rules run on the **exact same engine** as built-in rules. They participate in Auto Audit, manual audits, inline CodeLens/Hover, the Master Audit Checklist, and audit history reports.

---

## Storage & Directory Layout

Custom rules are stored locally in the workspace under `.craftlens/rules/`:

```
.craftlens/
├── config.json
├── checklist.md
├── suppressions.json
├── dismissals.json
└── rules/
    ├── brand.yml
    ├── architecture.yml
    ├── accessibility.yml
    ├── project-conventions.yml
    └── packs/
        ├── design-system/
        │   └── tokens.yml
        └── nextjs-standards/
            └── images.yml
```

---

## Declarative YAML Rule Schema

```yaml
id: BRAND-001
name: No gradients in dashboard surfaces
category: visual
description: Dashboard surfaces must use approved solid background tokens.
rationale: Gradients are reserved for marketing surfaces and impair data contrast in dashboards.
severity: warning
minimumAuditLevel: moderate
scope:
  include:
    - "src/dashboard/**"
    - "src/admin/**"
  exclude:
    - "src/dashboard/marketing-preview/**"
detection:
  type: css
  pattern: gradient
recommendation:
  summary: Replace gradient with approved solid surface token.
  rationale: Dashboard surfaces require high contrast and readability.
fix:
  type: assisted
  replacement: bg-surface-primary
  description: Replace gradient with approved surface token
tags:
  - brand
  - visual
  - dashboard
```

Custom rules can also be authored in standard `.json` format.

---

## Detection Engines

CraftLens supports five pluggable detection engines for custom rules:

### 1. `css`
Matches CSS properties, utility class patterns, or gradients.
```yaml
detection:
  type: css
  pattern: gradient               # Matches linear-gradient(...) or bg-gradient-to-*
```

### 2. `regex`
Matches custom regular expressions in source files.
```yaml
detection:
  type: regex
  pattern: 'jwt_secret_[a-zA-Z0-9]+'
  flags: 'g'
```

### 3. `text`
Exact substring matching for forbidden calls or deprecated tokens.
```yaml
detection:
  type: text
  pattern: 'console.log'
```

### 4. `ast`
Matches TypeScript/JSX AST elements, tags, or node types.
```yaml
detection:
  type: ast
  pattern: '<img>'                # Flags raw HTML <img> in Next.js projects
```

### 5. `dependency`
Detects forbidden or deprecated dependencies in `package.json`.
```yaml
detection:
  type: dependency
  dependencyName: 'moment'       # Suggests date-fns or native Temporal instead
```

---

## Rule Precedence Hierarchy

CraftLens evaluates rules in a predictable precedence order:

```
Built-in Rules
      ↓
Framework Rules (React, Next.js, Vue)
      ↓
Team / Rule Packs (.craftlens/rules/packs/*)
      ↓
Project Rules (.craftlens/rules/*.yml)
      ↓
Folder Scope (include / exclude patterns)
      ↓
File Overrides (inline // craftlens-disable comments)
```

More specific scopes and local definitions take precedence over broader ones.

---

## Interactive Custom Rule Builder

Run the VS Code command:
```
CraftLens: Create Custom Rule
```
The step-by-step native wizard guides you through:
1. Rule Name
2. Unique Rule ID
3. Category (`visual`, `css`, `code`, `architecture`, `accessibility`, `security`)
4. Description & Rationale
5. Severity (`warning`, `error`, `suggestion`)
6. Minimum Audit Level (`easy`, `moderate`, `hard`, `strict`)
7. File Scope (`include` glob)
8. Detection Type (`css`, `regex`, `text`, `ast`, `dependency`)
9. Pattern to match
10. Suggested recommendation & optional fix replacement

CraftLens immediately saves the file to `.craftlens/rules/<id>.yml`, loads it into the running engine, and opens the file in your editor.

---

## User Dismissals & "Not a Problem"

When developers choose **[Not a problem]** on any finding, CraftLens prompts for the reasoning:
* Brand Requirement
* Product Requirement
* Design System Exception
* Accessibility Requirement
* Framework Convention
* Intentional Exception
* False Positive

The dismissal is stored in `.craftlens/dismissals.json` alongside a line-level suppression comment (`// craftlens-disable-next-line <ruleId> -- reason: ...`). This preserves project continuity and avoids repeated false warnings.

---

## Security Considerations for Executable Rules

* **Declarative Rules (YAML/JSON):** Completely safe and sandboxed. They execute strictly through CraftLens's deterministic pattern, AST, and CSS scanners with zero arbitrary code execution.
* **Executable Rules (TypeScript Plugins):** For advanced teams building custom programmatic AST analyzers, CraftLens treats external code plugins as a privileged capability requiring explicit workspace opt-in. Never load untrusted third-party executable plugins.
