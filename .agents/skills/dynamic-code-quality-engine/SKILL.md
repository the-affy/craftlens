---
name: dynamic-code-quality-engine
description: Contextual code-quality and design-quality analysis engine providing project pattern detection, severity scoring, finding generation, contextual suggestions, safe autofixes, user rule parsing, and project convention extraction.
---

# Dynamic Code & Design Quality Engine

The Dynamic Code & Design Quality Engine transforms static linter rules into an adaptive, multi-signal analysis engine that understands actual codebase architecture, frameworks, styling strategies, and learned conventions.

## 1. Context Extraction & Convention Learning

Before running analysis on source files, the engine inspects the workspace:
1. **Framework & Language**: Detects React, Next.js, Vue, Svelte, Angular, Express, NestJS, Fastify, TypeScript, JavaScript.
2. **CSS Architecture & Design Tokens**:
   - Parses global CSS/SCSS files for custom properties (`--color-*`, `--radius-*`, `--space-*`, `--font-*`).
   - Maps raw hexadecimal or pixel values (e.g., `#6B7280` -> `--color-text-muted`, `24px` -> `--radius-lg`).
3. **Component System**: Identifies installed UI libraries (Tailwind, Radix, Shadcn, MUI, Chakra) and custom component directories (`src/components/ui`, `components`).
4. **Tooling & Setup**: Discovers ESLint, Prettier, Jest, Vitest, Cypress, Testing Library, axe-core.
5. **Learned Conventions**: Accumulates repetitive project patterns to propose replacements adhering to existing token nomenclature.

## 2. Multi-Signal Contextual Rule Evaluation

Isolated properties should rarely trigger warnings. Instead, the engine correlates signals across the file and project:
- **Single Instance**: `border-radius: 24px` on a hero card is legitimate styling.
- **Systemic Repetition**: When `24px` or `rounded-3xl` occurs across >80% of buttons, inputs, and cards without design token binding, it escalates to `moderate` with evidence of repetitive AI slop.
- **Interactive Elements**: `<div onClick={...}>` without `role="button"` or `tabIndex` triggers accessibility findings enriched with the component's surrounding JSX tree.

## 3. Severity Scoring & Classification

Findings are strictly classified into 4 canonical semantic severities:
- 🔴 **Error (`error`)**: Broken accessibility, exposed secrets, severe runtime bugs.
- 🟡 **Warning (`warning`)**: Heavy visual slop, missing error handling, dangerous type bypasses (`any`).
- 🟠 **Moderate (`moderate`)**: Repetitive UI patterns, arbitrary hardcoded values where design tokens exist.
- ⚪ **Info (`info`)**: Informational recommendations and passive consistency notes.

## 4. Context-Aware Suggested Fixes (Three Dynamic Suggestions)

Every actionable finding generates up to 3 distinct, non-generic suggestions:
1. **Suggestion ① - Use Existing Convention/Token**:
   - Matches the detected project token (e.g., replace `#6B7280` with `var(--color-text-muted)`).
2. **Suggestion ② - Theme or Framework Integration**:
   - Connects to the component library or theme context (e.g., `textMuted` from theme provider).
3. **Suggestion ③ - Semantic Extraction / Architectural Fix**:
   - Extracts into a reusable component or tokens file if intentionally reusable.

### Action Types & Safety
- **`Apply`**: Automated safe replacement with verified diff.
- **`Replace` / `Insert`**: Guided editor insertion.
- **`Copy fix`**: Copy snippet to clipboard for complex multi-line refactors.
- **`Keep value`**: Add inline suppression if the value is intentionally independent.

## 5. User-Defined Rules & Markdown Parser

Users can supply rules via:
- Uploading Markdown (`.md`, `.markdown`, `.txt`)
- Importing from URL (with live preview, validation, and approval)
- Pasting Markdown in the editor

Markdown format specification:
```markdown
# UI Rules
## Avoid excessive rounded cards
Do not use large rounded cards everywhere.
Severity: warning

## Avoid gradient text
Avoid gradient text unless explicitly required.
Severity: moderate
```

Rules are parsed into structured AST patterns, categorized (`ui-ux`, `code-quality`, `security`, `accessibility`), and executed alongside built-in rules.

## 6. Skill Recommender & Execution

Based on detected characteristics:
- **React / Next.js Frontend**: Recommends `UI/UX Quality`, `Accessibility`, `Design Systems`.
- **Backend / API Service**: Recommends `Security`, `Code Quality`, `API Design`, `Error Handling`.
- **Design-Heavy Frontend**: Recommends `Visual Consistency`, `Design Tokens`, `Responsive Design`.
