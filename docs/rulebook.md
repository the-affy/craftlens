# Anti-Slop Rulebook

This document details the active rules implemented in Phase 1 and the specifications for upcoming high-confidence rules.

---

## Active Rules (Phase 1)

### AP-008 — Silent Exception Swallowing
- **Category:** `patchwork`
- **Severity:** `warning`
- **Confidence:** `0.95`
- **Engine:** `ast`
- **Fix Policy:** `safe` (Quick Fix)
- **Problem:** Catch block discards caught errors without recovery, logging, or user feedback.
- **Why It Matters:** AI agents frequently introduce empty `catch {}` blocks to make failing code stop throwing errors, concealing latent data corruption and network failures.
- **Remedy:** Provide explicit recovery, logging (`console.error`), or rethrow to caller.
- **False-Positive Guard:** Catch blocks with intentional comments (`// intentional`, `// ignore`, `/* expected */`) are preserved and unflagged.

---

### AP-014 — Unsafe Any Escape Hatch
- **Category:** `patchwork`
- **Severity:** `warning`
- **Confidence:** `0.90`
- **Engine:** `ast`
- **Fix Policy:** `safe` (Quick Fix)
- **Problem:** Explicit use of `: any` or `as any` disables TypeScript's type checker.
- **Why It Matters:** When AI tools hit complex generic or union type errors, they routinely insert `any` to force compilation, breaking refactoring safety.
- **Remedy:** Replace `any` with `unknown` and use type narrowing guards or explicit domain interfaces.
- **False-Positive Guard:** Declaration files (`.d.ts`) and code annotated with `// legacy interop` are ignored.

---

### FN-015 — Clickable Non-Interactive Element
- **Category:** `functionality`
- **Severity:** `warning`
- **Confidence:** `0.95`
- **Engine:** `ast`
- **Fix Policy:** `assisted` (Quick Fix)
- **Problem:** Generic `<div>` or `<span>` element has an `onClick` listener without button semantics or keyboard support.
- **Why It Matters:** Fails WCAG accessibility standards, excludes keyboard-only navigation (Enter / Space), and degrades mobile accessibility.
- **Remedy:** Use a semantic `<button type="button">` or provide `role="button"`, `tabIndex={0}`, and `onKeyDown` handlers.
- **False-Positive Guard:** Native buttons, links, `aria-hidden="true"` elements, and custom design-system components are not flagged.

---

### AS-001 — Generic AI SaaS Pattern (Cluster POC)
- **Category:** `cluster`
- **Severity:** `suggestion`
- **Confidence:** Composite calculated ($\ge 0.90$)
- **Minimum Signals Required:** 3
- **Signals:** Centered hero, dual CTA buttons, feature card triplets, AI badge capsule, generic marketing copy.
- **Why It Matters:** Prevents noisy individual warnings for standard patterns, firing only when multiple signals correlate into an uncalibrated template layout.

---

## Phase 2 Roadmap Rules

- **CD-023**: Giant Component (line count, hook density, nested branches, JSX depth)
- **CD-025**: Deep JSX Logic (complex ternary expressions inside JSX)
- **CD-028**: Effect for Derived State (unnecessary `useEffect` updating state derivable from props)
- **AP-002**: Defensive Null Patch (excessive `foo !== null && foo !== undefined` when types guarantee existence)
- **AP-004**: Repeated Optional Chaining (excessive `a?.b?.c?.d` masking invariant failures)
- **AX-016**: Icon Button Without Accessible Name (`<button><Icon /></button>` without aria-label)
- **CSS-005**: Magic Z-Index (`z-[999999]` escalation patches)
- **PH-011**: Lorem Ipsum in user-facing UI
