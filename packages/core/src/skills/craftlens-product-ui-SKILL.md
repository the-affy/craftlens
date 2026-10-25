---
name: craftlens-product-ui
description: >
  Design, implement, simplify, polish, or audit web and app interfaces without
  generic AI-template aesthetics. Start from product intent and existing systems,
  detect visual and code-level anti-patterns contextually, cover real interaction
  states, and verify the rendered result. Use for landing pages, dashboards,
  forms, marketing sites, mobile interfaces, and frontend code review.
version: 1.0.0
---

# CraftLens Product UI Skill

## Mission

Build or review interfaces that are specific to their product, clear to use, accessible,
maintainable, and production-ready. Avoid generic, statistically averaged design patterns
without treating any font, color, component, framework, or layout as inherently wrong.

**Core test:** Could the product name and logo be swapped for a competitor's without the
interface or copy needing meaningful changes? If yes, investigate whether the work lacks
product-specific intent.

This skill is a consolidated implementation-oriented synthesis of:
- `Vanszs/Anti-AI-UI` — Anti-AI-Slop filter, visual/code pattern catalog, and its Filter →
  Palette → Research approach.
- `github/awesome-copilot/skills/anti-ui-slop` — product-first design, playbooks for new
  work, operation, polish, simplification, audit, native iOS, and optional reference policy.

It is an original synthesis, not a byte-for-byte copy of either repository or a substitute for
their full reference libraries. See **Sources and attribution** at the end.

## Non-negotiable principles

1. **Product before style.** Establish the audience, user job, content, workflow, constraints,
   and success condition before choosing a visual direction.
2. **Existing system outranks this skill.** Read the product brief, routes, components,
   design tokens, content, and current UI first. Extend a coherent system instead of replacing it.
3. **Evidence before findings.** Point to a rendered region, component, DOM/code location,
   token, interaction, or reproducible state. Never invent requirements or defects.
4. **Patterns are signals, not verdicts.** Purple, Inter, cards, gradients, glass, grids, or
   common icons may be appropriate when justified by the product. Escalate combinations,
   repetition, lack of rationale, and user impact—not isolated aesthetic preferences.
5. **Every issue gets a fix.** State the observable tell, why it matters, severity, and the
   smallest useful correction.
6. **Preserve useful familiarity.** Standard navigation, buttons, forms, tables, menus, and
   dialogs should remain predictable unless the product already has a coherent alternative.
7. **Complete the states.** Design for loading, empty, error, success, disabled, selected,
   expanded, permission-denied, offline, and recovery states where applicable.
8. **Accessibility and security are not aesthetic preferences.** Treat verified barriers,
   exposed secrets, injection risks, and keyboard failures as functional defects.
9. **Respect scope.** Polish should improve the existing interface, not smuggle in a redesign.
   Simplification must not remove required capability or hide essential actions.
10. **Verify the rendered result.** When the environment supports it, run/render the UI at
    representative sizes, inspect it, fix observable defects, and verify the changed surface.

## Operating workflow

### Phase 1 — Classify the request

Choose one primary mode:
- **New work / major redesign**
- **Operate / product dashboard**
- **Polish / refinement**
- **Distill / simplify**
- **Audit / critique**
- **Native iOS**

Load and apply only the corresponding playbook below. Do not stack every playbook onto one task.

### Phase 2 — Read product context

Before changing UI, inspect:
- product brief, audience, user intent, main task, and primary action;
- existing pages/screens, routes, components, tokens, type scale, spacing, icon system,
  color semantics, motion conventions, and responsive breakpoints;
- content/data shape, permissions, business rules, technical stack, constraints, and acceptance criteria;
- current behavior and existing issues, when a runnable implementation exists.

If context is missing, infer only what is low-risk. Mark assumptions and placeholders. Ask a concise
clarifying question only when an unresolved decision materially changes the implementation.

### Phase 3 — Establish a design contract

Write down, briefly:
- primary user and task;
- information hierarchy and primary action;
- visual direction and why it fits this product;
- existing tokens/components to reuse;
- content and imagery requirements;
- responsive structure;
- required states and interactions;
- accessibility constraints;
- explicit anti-patterns to avoid for this specific project.

Do not offer a menu of styles by default. Choose one coherent direction grounded in the product.

### Phase 4 — Design and implement

- Use real product content, data, screenshots, and imagery when available. Clearly label placeholders.
- Make product objects, workflow, priorities, and next action visually obvious.
- Preserve familiar interaction conventions; make distinction through product-specific content,
  structure, type, imagery, and behavior rather than novelty for novelty's sake.
- Prefer spacing/alignment and semantic grouping before adding borders, cards, or backgrounds.
- Keep typography, spacing, colors, radii, icon treatment, and motion internally consistent.
- Make responsive behavior structural: define what stacks, collapses, scrolls, or stays fixed.
- Implement every state and interaction that can actually occur; do not ship inert controls.

### Phase 5 — Audit visual and code signals

Run the checklists and pattern groups below. Treat the severity table as a prioritization aid,
not as an automatic judgment about authorship.

### Phase 6 — Finish gate

When possible:
1. Run the application or render the changed surface.
2. Inspect desktop and mobile/tablet sizes relevant to the task; use the appropriate device class
   for native UI.
3. Test primary and secondary actions, keyboard focus/order, forms, overlays, navigation, and states.
4. Fix clipping, overlap, overflow, broken media, unreadable hierarchy, inaccessible controls,
   broken focus, and inert interactions.
5. Recheck the changed surface once after fixes.
6. Stop when the requested scope works and is coherent. Do not add decorative polish or speculative
   refactors just to make the diff larger.

---

## Playbooks

### A. New interface or major redesign

- Identify the primary user, their main task, and the one action that matters most.
- Choose one coherent direction suited to the product and its content.
- Establish reading order: orientation → primary content → primary action → secondary detail.
- Reuse the local design system; extend it only where needed.
- Keep familiar controls familiar.
- Use representative content that exercises the layout.
- Include relevant loading, empty, error, success, disabled, and recovery states.
- Define responsive behavior before polishing details.
- Use motion to explain transitions, reveal state, or provide feedback—not as decoration.
- Render at relevant sizes and fix visible issues.

### B. Product and dashboard interfaces

- Make current location, task, and next action obvious.
- Match information density to the work. Dense tables and compact controls are valid when they help
  users; decorative containers are not required.
- Prefer standard navigation, forms, tables, tabs, menus, and dialogs.
- Use spacing and alignment for grouping before borders, cards, or backgrounds.
- Keep one component vocabulary across the surface.
- Cover relevant loading, empty, error, success, disabled, selected, expanded, and recovery states.
- Keep focus visible, controls named, contrast sufficient, and targets usable.
- Prevent menus/dialogs/popovers from being clipped by overflow or scroll containers.
- Keep motion short and state-oriented.
- Reflow layout and preserve important actions on smaller screens.
- Do not redesign working areas outside the requested scope.

### C. Polish an existing interface

Preserve visual language, content, behavior, and scope unless a redesign is requested.
Inspect the actual rendered result, not source code alone. Prioritize:
1. unclear hierarchy or competing primary actions;
2. inconsistent spacing, typography, color, radii, or icon treatment;
3. clipping, overlap, overflow, distorted media, or awkward wrapping;
4. missing hover/focus/disabled/loading/empty/error/success feedback;
5. inaccessible controls, weak contrast, or poor keyboard behavior;
6. decorative noise competing with the task.

Fix related issues in one coherent pass, reuse existing tokens/components, avoid speculative cleanup,
and leave areas that already work alone.

### D. Simplify / distill

- Identify the main user goal and the information needed to complete it.
- Remove repeated copy, duplicate actions, decorative noise, and containers that do not clarify grouping.
- Reduce needless variation in colors, type sizes, buttons, spacing, and surfaces.
- Prefer one obvious primary action with a small number of subordinate actions.
- Use progressive disclosure for advanced/infrequent controls while keeping essential information visible.
- Never hide required actions behind mystery interactions.
- Never remove labels, focus states, accessibility semantics, errors, or recovery paths.
- Do not flatten genuinely complex information until it becomes harder to understand.
- Prefer spacing/alignment over nested cards and plain language over explanatory filler.
- Verify the full task still works at relevant screen sizes.

### E. Audit an implemented interface

Review only observable implementation or rendered behavior. Do not invent requirements or treat taste
as a defect. Inspect:
- task clarity and hierarchy;
- consistency with the existing product system;
- layout, overflow, imagery/media, and responsive behavior;
- interaction feedback and required states;
- labels, focus, keyboard access, target size, and contrast;
- obvious user-visible performance issues.

Return up to three material findings in a concise audit, ordered by user impact. Each finding must include
evidence and the smallest concrete correction. If nothing material is visible, say so. An audit does not
modify code unless fixes were requested.

### F. Native iOS

- Follow the product's existing conventions, then Apple platform conventions.
- Use a navigation stack for hierarchy, a tab bar for a small set of top-level destinations, and sheets
  for self-contained tasks.
- Preserve edge-swipe back behavior and safe areas.
- Prefer native controls, materials, menus, alerts, sheets, pickers, and text behavior unless the product
  has a coherent custom system.
- Support comfortable touch targets, scalable text, accessible labels, and sensible focus order.
- Account for keyboard, long content, Dynamic Type, reduced motion, dark mode, and device insets.
- Include relevant loading, empty, error, success, permission-denied, offline, disabled, and recovery states.
- Do not communicate state by color alone.
- When a simulator/build exists, inspect the appropriate device class and fix clipping, overlap, unsafe-area
  violations, unreadable text, broken navigation, and inaccessible controls.
- Do not require extra tools if the environment cannot provide them.

---

## Five design axes

Make a deliberate, product-grounded decision for each axis. Do not blindly enforce the example defaults.

### 1. Color

- Define semantic tokens: primary/brand, accent(s), neutral/surface ramp, text, border, focus, and
  success/warning/error/info states.
- Use a coherent palette and restrained emphasis (a 60/30/10 split is a heuristic, not a law).
- Avoid defaulting to indigo/violet/purple or purple-pink/blue-cyan gradients without brand rationale.
- Avoid gradients on text, buttons, borders, and backgrounds all at once. Limit gradients to purposeful
  focal areas.
- Avoid glow as a substitute for hierarchy; shadows should communicate elevation.
- Avoid saturated colors everywhere and random per-component hex values.
- Ensure text and UI contrast. Target WCAG AA: 4.5:1 for normal text and 3:1 for large text and relevant
  non-text UI components. Verify actual colors, not just token names.
- Check both light and dark themes if supported.
- Never use color as the only signal for status or errors.

### 2. Typography

- Define a consistent type system with clear hierarchy and readable line lengths.
- Do not default to Inter/Geist for every role without considering brand and product context. They are
  not inherently bad and may be appropriate for body text or existing systems.
- Avoid gradient-text headlines and repeated oversized extra-bold, tightly tracked headings.
- Use a deliberate scale rather than many arbitrary sizes; roughly 4–6 major sizes often suffice.
- Keep font weights restrained (usually 2–3); avoid using light body text where readability suffers.
- Keep paragraphs readable (often around 60–75 characters per line); avoid full-width long text.
- Center short headings/taglines only when it serves the composition; body paragraphs usually benefit
  from left alignment.
- Vary line-height by role; keep heading leading tighter than body leading.
- Use wide letter spacing sparingly, mostly for small labels.
- Use monospace for code/data that benefits from it, not as generic “tech” decoration.
- Keep families and roles consistent across components.

### 3. Layout, cards, and spacing

- Avoid repeating the same section anatomy (heading + subtitle + identical three-card grid + CTA) across
  the entire page.
- Do not default every section to a centered hero, symmetric dual CTAs, identical three-column grids,
  identical container widths, or identical vertical padding.
- Vary composition only when hierarchy/content warrants it: split layouts, lists, tables, asymmetric spans,
  full-bleed moments, editorial layouts, or grids can all be valid.
- A bento layout requires meaningful differences in size and hierarchy; equal tiles are just a grid.
- Avoid repeating alternating image/text blocks indefinitely.
- Establish one dominant focal element per section where appropriate; not every element should have equal weight.
- Use a spacing scale (e.g. multiples of 4 or 8) but allow semantic exceptions. Internal spacing should
  generally be tighter than the spacing between groups.
- Vary container width according to content, not arbitrary novelty.
- Avoid uniform `rounded-2xl`, shadow, border, or glass treatments on every surface. Define a radius and
  elevation scale by component role.
- Prefer spacing/dividers over card-in-card nesting. Keep nesting shallow unless the content model needs it.
- Avoid decorative left-border accents unless the border conveys a real semantic state.
- Do not use hover scale effects that cause collisions/layout instability.
- Do not force asymmetry or variation if it harms scanning, consistency, or the existing design system.

### 4. Icons, illustration, and imagery

- Avoid emoji as functional interface icons; use a consistent accessible icon system.
- Do not mix icon libraries/styles without a reason. Match size, stroke, and visual weight.
- Choose icons for meaning, not because their names sound trendy. Use text labels where an icon is ambiguous.
- Avoid spraying many equal-weight icons across every feature.
- Avoid oversized decorative line icons, glow behind icons, rainbow coloring, and meaningless status dots.
- Use a logo/brand mark, not a generic letter in a rounded square as a permanent placeholder.
- Prefer authentic product screenshots, actual imagery, or a deliberate typographic treatment over generic
  stock “team at laptop” images and artifact-prone generated hero imagery.
- Use custom or context-appropriate illustrations when they add information; do not reuse the same generic
  illustration pack as a substitute for product identity.
- Every status dot/badge must communicate a defined state. Do not animate static “new/live” badges.

### 5. Copy and content

- Write for the specific user and product. If the product name can be swapped with a competitor and the
  copy still works, improve specificity.
- Replace hype verbs such as “supercharge,” “unlock,” “revolutionize,” “elevate,” and “empower” with
  concrete outcomes and actions when those words add no information.
- Avoid vague claims like “seamless,” “effortless,” “frictionless,” “robust,” “powerful,” “world-class,”
  “cutting-edge,” or “for modern teams” unless immediately substantiated.
- Never invent performance metrics, customer counts, testimonials, awards, or logos. Verify claims or label
  content clearly as a placeholder.
- Make CTAs specific to the action (“Import records”, “Compare plans”) rather than generic everywhere
  (“Get Started”, “Learn More”).
- Ensure headline and subheading have different jobs: what it does vs. how/for whom/why.
- Remove template headlines (“The future of…”, “Transform your workflow”) and throat-clearing intros.
- Remove lorem ipsum, TODOs, unexplained placeholders, and demo-only claims before release.
- Avoid repetitive sentence rhythms, mechanical rule-of-three lists, filler conclusions, and overused em dashes.
  These are weak signals only; do not rewrite good content just to dodge a stylistic heuristic.
- Prefer plain, active, concrete language. Preserve the brand's real voice rather than forcing artificial
  cheerfulness or an edgy tone.

---

## Component-specific pattern catalog

### Hero / above the fold

**Signals to inspect:** centered headline + subheading + symmetric primary/secondary CTA; gradient text; decorative
eyebrow pills; aurora blobs; tilted fake dashboard mockups with glow; unverified trust-logo strips; empty full-screen
hero; default hero → features → pricing → FAQ → CTA page order.

**Corrections:** use product-specific headline and proof; one dominant action; secondary text link if useful; real
product imagery; meaningful hierarchy; remove unverified logos; vary page structure when content calls for it.
Full-height heroes are valid when the visual content earns the space.

### Color / gradients

**Signals:** default purple/indigo accent with familiar purple-pink or blue-cyan gradient; gradients on every surface;
neon glow; animated mesh/aurora backgrounds; random saturated accents; no semantic token system.

**Corrections:** choose a defensible brand palette, define tokens, keep most surfaces solid, reserve emphasis for a
focal point, verify contrast, and avoid constant background repainting. Do not ban a genuine brand color.

### Cards / pricing / testimonials

**Signals:** identical three-card feature grids; uniform large radius + shadow + border; gradient borders; glass cards
everywhere; emoji cards; deeply nested cards; pricing card with decorative “Most Popular” ring and excessive
feature lists; fabricated testimonial avatars/ratings; dramatic hover lift; pulsing meaningless badges.

**Corrections:** choose cards only when they clarify grouping; consider lists, tables, editorial blocks, or asymmetric
grids; distinguish elevation and radius by role; keep pricing comparison scannable; use verified testimonials or none;
keep motion subtle and stateful.

### Layout / rhythm

**Signals:** every section uses the same padding, max-width, grid, alignment, or heading-subtitle-cards-CTA anatomy;
endless alternating split sections; fake bento; perfectly symmetric composition everywhere; one gap token used for all
contexts; mechanical Z/F pattern with no interruption.

**Corrections:** establish a spacing system, group by proximity, vary section anatomy where the content warrants it,
create meaningful hierarchy, and interrupt repetition selectively. Variation is not a requirement when repetition
supports a data-heavy workflow or established system.

### Buttons

**Signals:** gradient primary plus ghost secondary repeated everywhere; pill-shaped buttons for every action; oversized
buttons without hierarchy; emoji inside controls; generic CTA copy.

**Corrections:** establish button variants and sizes by semantic priority; usually one primary action per section/surface;
use a text link for a truly secondary action where appropriate; use specific labels; keep familiar control behavior.

### Forms

- Every control needs a programmatic label and appropriate instructions/help text.
- Validate inputs at the appropriate client and server boundaries.
- Show clear inline errors, preserve user input where safe, and provide success/confirmation feedback.
- Include disabled, submitting/loading, failure, and recovery states when relevant.
- Never rely on color alone for validation.
- Do not silently disable submission without explaining why.
- Use toggles for immediate binary settings; use checkboxes or radios when the user is making form selections
  committed by submission. Avoid switch overuse.
- Use visible keyboard focus and logical tab order.

### Navigation / footer / menus / overlays

- Make location and available next actions clear.
- Use predictable navigation conventions and avoid novelty for its own sake.
- Avoid mega-footers filled with dead links or redundant link columns.
- Ensure every link has a meaningful destination and every button performs an action.
- Menus, popovers, dialogs, and tooltips must be keyboard reachable, dismissible, and not clipped by overflow.
- Dialogs need appropriate semantics, focus management, Escape/dismiss behavior, and sensible focus return.
- Keep mobile navigation and important actions accessible without relying on hover.
- Avoid glassmorphic navigation unless the product context, contrast, and layering justify it.

### Motion

- Every animation must explain a transition, reveal state, or provide feedback.
- Respect `prefers-reduced-motion`; remove or simplify non-essential spatial movement.
- Prefer transform/opacity for simple transitions; avoid animating layout-heavy properties without need.
- Use short, responsive timing: often 100–150 ms for hover feedback and 200–300 ms for entrances; use judgment.
- Avoid universal fade-up-on-scroll, infinite floating blobs, constant animated gradients, gratuitous spring wrappers,
  typewriter effects, giant stagger delays, and shimmer outside loading states.
- Marquees must not be essential to reading; if used, allow pause/stop and reduced-motion fallback.
- Avoid scroll-jacking and parallax that can disorient users.
- Do not use `transition: all` as a blanket default. Name the properties that should transition.
- Do not animate every element; motion needs a budget and a task-based rationale.

### Dashboards, data, and charts

- Match density to the user's work; do not make a data-heavy interface artificially sparse.
- Put the most actionable information first; labels, units, dates, filters, and comparison context must be clear.
- Do not fabricate trendlines, KPIs, data, or confidence. Mark illustrative/demo data.
- Choose chart type based on the analytical question and data; use accessible labels and non-color encodings where needed.
- Avoid ornamental chart chrome, meaningless sparklines, gradients for every series, and excessive dashboard KPI cards.
- Tables need headers, sensible alignment, responsive behavior, sorting/filter feedback when provided, and empty/error/loading
  states where relevant.
- Ensure color palettes remain distinguishable in common color-vision deficiencies; consider direct labels and patterns.
- Preserve keyboard interaction and screen-reader semantics for interactive charts.

---

## Code-level anti-pattern checks

These are review signals, not proof of AI authorship. Confirm the project framework/version and inspect surrounding code
before proposing a fix.

### React state and hooks

- Derived state stored in `useState` and synchronized with `useEffect` when it can be computed during render.
- Excessive state variables in one component without clear state boundaries.
- `useCallback` or `useMemo` added everywhere without a measured performance or referential-stability reason.
- Missing memoization only becomes a finding when a measured/credible performance issue exists.
- Immutable configuration stored in state without need.
- Stale closures or incorrect hook dependency arrays.

### Data fetching and async lifecycle

- Client-side fetching in a framework route where server-side data loading is the appropriate convention.
- Effects fetching data without cancellation/cleanup, allowing race conditions or updates after unmount.
- Missing loading, error, empty, success, or retry/recovery handling.
- Unnecessary repeated fetching due to missing caching/deduplication where appropriate.
- Async effect callbacks that incorrectly return a Promise instead of cleanup.
- Sequential async work that could safely run in parallel.
- Missing Suspense/error boundaries or framework route-level loading/error/not-found states where appropriate.
- Client-side redirects where a server/framework redirect is the correct solution.

### Component architecture and React correctness

- God components combining data fetching, state, business logic, and large render trees.
- Prop drilling across many layers when composition or a suitable shared-state mechanism is clearer.
- Array index keys for reorderable/dynamic lists; missing or unstable keys.
- Everything placed in one file without meaningful boundaries.
- Inline handlers in genuinely hot paths causing measured re-render issues.
- Excessive prop APIs instead of children/composition for content.
- State lifted too high so unrelated areas re-render on every keystroke.

### TypeScript and CSS

- Broad `any`/`as any`, unexplained `@ts-ignore`, missing component prop types, over-permissive types, unsafe casts,
  or repeated non-null assertions.
- Dynamic Tailwind class strings that the build scanner cannot detect.
- Repeated inline styles where design tokens/classes already solve the problem.
- Sprinkled `!important`/important modifiers used to avoid fixing specificity or component boundaries.
- Desktop-only layout with no responsive strategy.
- Token drift: the same semantic role gets inconsistent values across components.

### Semantics and accessibility

- Clickable `<div>`/`<span>` where a button or link is needed.
- Links without meaningful destinations; buttons used for navigation without reason.
- Missing landmarks or heading hierarchy.
- Icon-only controls without accessible names.
- Dialogs without appropriate semantics, focus containment/return, dismissal, or keyboard support.
- Missing labels, incorrect ARIA, inaccessible custom controls, keyboard traps, or missing visible focus.
- Missing image alternatives when the image conveys information; decorative images exposed redundantly.
- Color-only state communication, inadequate contrast, tiny targets, or motion without reduced-motion handling.
- Prefer native semantic elements before adding ARIA. ARIA does not compensate for incorrect behavior.

### Security and hygiene

- Unsanitized HTML injection (e.g. unsafe `dangerouslySetInnerHTML`).
- Secrets/API keys in client bundles or public environment variables.
- Missing validation at trust boundaries; client validation alone is not security.
- Unnecessary debug logging or leakage of sensitive values.
- Unsafe URL handling, untrusted rendering, or missing authorization checks on server actions/API routes.
- Magic numbers and unexplained state codes where named constants improve clarity.
- Hard-coded user-facing strings where the project requires localization.
- Never prescribe a specific library as mandatory when a safe existing project solution is available.

### Performance and framework fit

- Client boundary (`use client` or equivalent) applied to large/static areas without need.
- Heavy libraries imported wholesale where smaller imports or existing platform APIs suffice.
- Images lacking responsive sizing/optimization where the framework supports it.
- Unnecessary full-page re-renders, waterfalls, or repeated expensive work.
- Missing route loading/error states and boundaries where the framework expects them.
- Performance findings must be supported by code evidence, profiling, or a credible user-visible impact—not by cargo-cult rules.

### Testing and maintainability

- No tests for meaningful behavior or regressions in a codebase that has a test strategy.
- Tests that only assert implementation details rather than user-visible behavior.
- Swallowed errors, ignored rejected promises, TODOs, dead code, and unfinished placeholders.
- Duplicate logic or over-complex functions that make changes risky.
- Lint/build/type errors introduced by the change.
- Do not demand a test framework the repository does not use; follow its existing conventions.

---

## Severity and evidence model

Use severity based on actual impact, not just the pattern name.

- **P0 / Critical:** verified security exposure, severe accessibility blocker, broken primary workflow,
  fabricated material claims, or a single pattern that creates a major usability/trust failure.
- **High:** major hierarchy/interaction problem, repeated convergence of generic signals, missing important states,
  significant keyboard/responsive breakage, or a clear maintainability risk.
- **Medium:** noticeable inconsistency, decorative noise, weak specificity, moderate responsive or interaction issue,
  or an avoidable code smell with plausible cost.
- **Low:** minor polish or cumulative signal with little direct user impact.

Every finding must contain:
- **Title / stable ID**
- **Severity and category**
- **Evidence:** file/line/component/route/viewport/state and what was observed
- **Why it matters:** user impact, not just taste
- **Recommendation:** smallest concrete correction
- **Confidence:** high/medium/low when detection is heuristic
- **False-positive notes:** when the pattern is valid or context-dependent
- **Verification:** how to confirm the fix

Suggested report format:

`[Severity] Finding — Evidence → Impact → Recommended fix → Verification`

## Signature detection and clustering

A single signal is rarely enough to label a page generic. Aggregate related signals by component, route, and page:
- default gradient/aurora + generic centered dual-CTA hero;
- repeated identical three-card feature sections;
- generic hype copy and unverified trust claims;
- uniform large-radius cards/glass/shadows;
- repeated generic icons and decorative status badges;
- identical section anatomy across multiple routes;
- no product-specific objects, workflow, or proof.

The upstream Anti-AI-UI skill describes an “instant-death” cluster at three or more tells; its pattern catalog also describes a stronger five-plus gestalt. Use a cluster threshold as a triage heuristic, not as an automatic proof. A project may intentionally use a consistent system. Check whether the design is grounded in a real brand/system and whether repetition serves the task.

Cross-screen convergence:
- Compare multiple routes/screens for the same template repeated without content-specific variation.
- Distinguish intentional design-system consistency from copied page anatomy.
- Prefer one aggregate finding for a repeated cluster rather than one duplicate finding per component.
- Never claim a page is AI-generated. Report “generic pattern”, “template-like signal”, or “specificity risk”.

## Context and false-positive safeguards

Before reporting a pattern:
1. Check whether it is part of an established brand or design system.
2. Check product type and task. Dense tables, repeated cards, standard layouts, and familiar fonts may be correct.
3. Check whether the pattern supports comprehension, accessibility, or consistency.
4. Check whether the issue is observable and meaningful.
5. Prefer evidence and user impact over taste.
6. Do not penalize a design solely for using Tailwind, shadcn/ui, Lucide, Inter, purple, gradients, cards, or a common layout.
7. Do not force asymmetry or novelty just to look different.
8. Do not use visual-pattern checks as substitutes for factual, legal, security, or accessibility review.

## Pre-delivery checklist

### Product fit
- [ ] Primary user, task, and action are clear.
- [ ] Design decisions are explainable by product/content/context.
- [ ] Existing tokens/components are reused where appropriate.
- [ ] Content, metrics, testimonials, and logos are real or clearly marked placeholders.
- [ ] The interface could not be generically relabeled without losing its product specificity.

### Visual system
- [ ] Palette and semantic tokens are coherent; contrast is checked.
- [ ] Typography hierarchy, line length, and weight usage are intentional.
- [ ] Layout and section rhythm fit content; repeated grids are justified.
- [ ] Radius, shadows, borders, cards, and surfaces have differentiated roles.
- [ ] Icons and imagery are consistent, meaningful, and appropriate.
- [ ] Decoration does not compete with the primary task.

### Function and accessibility
- [ ] Primary/secondary actions are clear and work.
- [ ] Loading, empty, error, success, disabled, and recovery states are covered where applicable.
- [ ] Forms have labels, validation, error/success feedback, and safe submission behavior.
- [ ] Keyboard access, focus visibility/order, semantic controls, and accessible names work.
- [ ] Contrast, non-color state cues, alt text, and target sizes are checked.
- [ ] Reduced motion is respected; animations serve a purpose.
- [ ] Mobile/responsive layout preserves key information and actions.
- [ ] Overlays are not clipped; dialogs manage focus and dismissal.

### Code and release
- [ ] No introduced secrets, unsafe HTML injection, or missing trust-boundary validation.
- [ ] Async work has appropriate cleanup, cancellation, error handling, and race protection.
- [ ] Types and framework conventions are respected.
- [ ] No debug logs, placeholder content, TODOs, or dead controls remain in shipped scope.
- [ ] Relevant lint, typecheck, tests, and build have been run when available.
- [ ] Rendered result has been inspected at representative sizes.
- [ ] Claims about testing or verification match what was actually run.

## Optional external visual references

Start with the local product and design system. External references are optional and should answer a concrete,
unresolved design question—not replace product reasoning.

If a visual-reference provider or MCP is available:
- Use it only when evidence could change a specific layout, state, interaction, icon, font, or animation decision.
- Refine a search at most once if the first result is not useful.
- If no relevant reference is found, continue with local knowledge; do not invent a result.
- Learn structural or interaction lessons only. Do not copy another product's branding, proprietary copy,
  imagery, or exact layout.
- Never claim a provider is connected unless the host confirms it.

## Output contract

For a build task, briefly state the design contract and then implement.
For a polish task, preserve working behavior and limit changes to the requested surface.
For an audit, return at most three material findings by impact unless the user explicitly asks for an exhaustive audit.
For each finding, include evidence, impact, a concrete fix, severity, and relevant false-positive caveat.
For every task, report what was actually verified and what could not be tested.


---

# Integrated Design Intelligence: UI/UX Pro Max + Impeccable

This section extends the CraftLens Product UI workflow with two complementary methods:
- **UI/UX Pro Max-style design intelligence:** structured, searchable recommendations for product categories, visual styles, palettes, typography, page patterns, charts, UX, motion, and implementation stacks.
- **Impeccable-style design operations:** explicit project context, plan-before-build workflows, focused critique/refinement modes, reusable design-system extraction, and bounded verification.

These are adapted principles and integration requirements. They are not a reproduction of either project's full datasets, command implementation, reference corpus, or source code.

## 1. Project context gate: PRODUCT.md and DESIGN.md

Before a substantial design task, inspect the repository for project context files and existing equivalent documentation.

### PRODUCT.md — product truth

Record or infer carefully:
- Product purpose and audience.
- Main user needs and jobs-to-be-done.
- Primary workflows and business/product goals.
- Core capabilities and differentiators.
- User trust constraints and claims that require evidence.
- Product category and whether the surface is primarily **brand/marketing** or **product/application**.
- Content, domain, regulatory, platform, and technical constraints.

Do not fill missing facts with fabricated product claims. Use explicit assumptions/placeholders and ask only when the missing answer materially changes the design.

### DESIGN.md — design truth

Record or extract:
- Brand-versus-product design lane and visual personality.
- Existing color tokens, semantic colors, type families/scales, spacing scale, radii, elevation, borders, and motion.
- Component library, icon set, layout patterns, and interaction conventions.
- Accessibility and responsive requirements.
- Anti-references: patterns the product deliberately avoids.
- Allowed exceptions and the reason for each exception.

If files are missing, inspect source code, styles, tokens, components, and rendered screens before proposing new rules. Create or update documentation only when requested or appropriate to the task; do not overwrite established documentation without checking it first.

### Brand lane versus product lane

**Brand/marketing surfaces** may justify a more expressive visual signature, editorial typography, unusual composition, stronger imagery, or a memorable hero when those choices support the brand and message.

**Product/application surfaces** usually prioritize task clarity, predictable navigation, readable data, information density, accessible interaction, and state feedback.

These are contextual defaults, not rigid categories. A product can be expressive; a marketing page can be restrained. Judge against the product's intent and audience.

## 2. UI/UX Pro Max-style design-system reasoning

For new pages or major redesigns, produce a compact design-system decision before writing implementation code. Base decisions on product context, existing system, and evidence—not on arbitrary style names.

The design-system decision should cover:

1. **Product pattern:** information architecture and page/landing pattern suitable for the product type.
2. **Visual direction:** a coherent style and its rationale.
3. **Color system:** brand and semantic colors, surface ramp, text, borders, focus, status colors, and contrast.
4. **Typography:** roles, font pairing, scale, line-height, readable line length, and fallback behavior.
5. **Layout and spacing:** content width, grid or flow, density, spacing scale, responsive changes, and hierarchy.
6. **Interaction and effects:** hover/focus/active/disabled states, elevation, motion, and reduced-motion behavior.
7. **Data visualization:** chart choice that answers the actual analytical question, with labels, units, comparisons, and accessible encodings.
8. **Implementation stack:** framework-specific conventions and existing component libraries.
9. **Anti-patterns to avoid:** project-specific risks, including generic patterns detected in the current work.
10. **Verification criteria:** observable checks that determine whether the decisions worked.

Do not generate a giant design specification for a small component fix. Use the smallest design-intelligence pass appropriate to the scope.

### Searchable design-intelligence domains

When a local searchable design database is installed or available, retrieve targeted guidance from the domain that matches the problem:

- **product:** product category and audience-specific needs.
- **style:** visual styles and their appropriate contexts.
- **color:** product-appropriate palettes and semantic color use.
- **typography / fonts:** font pairings, hierarchy, readability, and fallback.
- **landing:** landing-page structure, proof, and CTA strategy.
- **chart:** chart selection and data presentation.
- **ux:** interaction patterns, accessibility, states, and common usability failures.
- **icons:** icon meaning, consistency, and accessible labeling.
- **motion / GSAP:** animation techniques and motion complexity when relevant.
- **web / stack-specific domains:** platform and framework guidance for React, Next.js, Vue, Svelte, HTML/CSS, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, or another supported stack.

Only use domains that materially affect the task. Pure backend, infrastructure, or unrelated code tasks do not need a visual-design search.

### Query contract

Choose the smallest search mode that fits the task:

- **New product/page or system-wide direction:** request a complete design-system recommendation.
- **One specific issue:** search one explicit domain, such as accessible form errors, typography hierarchy, responsive overflow, or chart selection.
- **Known implementation stack:** add stack-specific guidance when it affects the implementation.
- **Accessibility:** search for an observable outcome (for example, keyboard focus in a dialog), not the vague phrase “make it accessible.”
- **Follow-up:** if results are irrelevant, refine the query once with more specific product, platform, component, or interaction terms. Do not endlessly cycle through broad queries.

When no searchable dataset or tool is installed, follow the same reasoning manually. Never pretend a search was run or that a database was available when it was not.

### Design-system persistence and page overrides

For projects with multiple pages or teams, prefer a hierarchical system:

- **Master system:** global tokens, typography, component rules, accessibility constraints, and visual direction.
- **Page-specific overrides:** only genuine page-specific requirements that cannot be satisfied by the master system.

Resolve rules in this order:
1. Read the global master system.
2. Read the target page's override, if it exists.
3. Apply the page override only where it intentionally differs.
4. Preserve global rules everywhere else.
5. Do not create an override merely to excuse accidental drift.

Never overwrite an existing master system automatically. Inspect it first; preserve user changes and explain conflicts.

### Design dials (optional)

For projects that need explicit creative calibration, use three conceptual controls:

- **Variance:** restrained and familiar ↔ distinctive and asymmetric.
- **Motion:** static/subtle ↔ choreographed/expressive.
- **Density:** spacious and sparse ↔ compact and information-rich.

Treat these as design constraints, not numeric laws. Set them according to product context, user needs, platform, accessibility, and existing brand. High variance does not mean random composition; high motion does not excuse distraction; high density does not excuse illegibility.

## 3. Impeccable-style workflow and design operations

Translate design work into a small number of explicit modes. These are workflow labels for this skill; they do not imply that an external CLI or command has been installed.

### Plan and build

**Shape → Build → Verify**
- Shape: clarify the task, user journey, information architecture, states, design direction, and acceptance criteria before coding.
- Build: implement the agreed direction using the project's existing system and actual content.
- Verify: inspect rendered output and interactions, fix material defects in a bounded pass, and report what was tested.

Use planning depth proportional to risk and scope. A small button adjustment does not require a full product discovery phase.

### Core modes

- **Teach / establish context:** help create or refine product and design context files.
- **Document:** extract the current design system from real source code, tokens, and components rather than inventing a new one.
- **Extract:** identify reusable tokens, component patterns, and variants; verify that proposed abstractions occur more than once or solve a real consistency problem.
- **Craft:** shape and build a feature end-to-end with its actual states and acceptance criteria.
- **Critique:** evaluate hierarchy, clarity, information architecture, cognitive load, product fit, and interaction logic.
- **Audit:** inspect observable accessibility, responsive, interaction, performance, and implementation issues.
- **Polish:** fix the highest-impact inconsistencies and finish-quality defects without expanding scope.
- **Distill:** remove redundant UI and cognitive load while preserving necessary functionality and accessibility.
- **Bolder:** increase a design's distinctiveness only when the current result is bland relative to the product's intent.
- **Quieter:** reduce visual competition and overstimulation when the design is too loud.
- **Animate:** add motion only to communicate state, hierarchy, cause-and-effect, or meaningful feedback.
- **Colorize:** establish or refine a coherent semantic palette and verify contrast and state meaning.
- **Harden:** examine edge cases, error states, permissions, keyboard access, responsive behavior, and robustness.
- **Optimize:** address measured or evidence-backed performance and usability bottlenecks.
- **Adapt:** adjust a design for a different screen size, platform, density, input mode, or accessibility need.

Select one primary mode and add another only when it solves a separate need. Do not execute every mode for every request.

## 4. Seven focused design reference areas

Use these as audit and implementation domains. Load only the relevant sections for the task.

### A. Typography

- Define roles, a readable scale, line-height, width, and weight hierarchy.
- Consider font personality and language coverage; do not select a font merely because it is fashionable.
- Check text wrapping, overflow, truncation, tabular data alignment, variable-font support, and fallback fonts.
- Keep headings distinct from body copy without making every heading oversized or extra-bold.
- Preserve readable text sizes under zoom and text scaling.

### B. Color and contrast

- Define semantic roles rather than scattering raw values through components.
- Consider OKLCH or another appropriate color model when it improves controlled palette construction; it is optional, not a requirement.
- Use tinted neutrals when they improve cohesion, but do not add color merely to make surfaces look “designed.”
- Verify contrast for text, borders, controls, focus rings, and status indicators in all supported themes.
- Make dark mode a deliberately checked theme, not a mechanically inverted light theme.
- Check color-vision accessibility and never encode essential meaning with color alone.

### C. Spatial design

- Establish a spacing scale, grid, alignment rules, content widths, and component density.
- Use proximity and alignment to communicate grouping before adding borders or cards.
- Check optical alignment and actual rendered balance, not just mathematical symmetry.
- Use whitespace to clarify hierarchy; do not force empty space into dense work tools.
- Check nested containers, inconsistent gaps, inconsistent radii, cramped controls, and oversized empty regions.
- Use page-specific layout variations only when they serve the content or task.

### D. Motion design

- Specify trigger, purpose, duration, easing, distance, and reduced-motion behavior.
- Motion should clarify causality, feedback, hierarchy, or a change of state.
- Avoid decorative loops, scroll hijacking, excessive stagger, and animation that delays task completion.
- Prevent layout shifts and avoid motion that interferes with reading, input, or focus.
- Provide a static or reduced-motion alternative when motion is nonessential.

### E. Interaction design

- Define idle, hover, focus, pressed, selected, disabled, loading, success, error, and recovery states as applicable.
- Make controls discoverable and their outcomes predictable.
- Preserve entered data on recoverable errors when safe.
- Provide validation close to the relevant field and a clear summary for complex forms where useful.
- Make dialogs, menus, tooltips, tabs, and popovers keyboard-operable and correctly dismissible.
- Prevent double submissions, duplicate actions, stale async results, and ambiguous feedback.
- Avoid hover-only functionality and hidden essential actions.

### F. Responsive design

- Design around content and available space, not around a list of device widths alone.
- Use fluid sizing and content-driven breakpoints where supported.
- Define what stacks, wraps, collapses, scrolls, becomes sticky, or changes priority.
- Test long words, translated strings, zoom, dynamic text, dense tables, dialogs, and narrow viewports.
- Avoid horizontal overflow unless it is intentional and usable (for example, a data table with a clear scroll affordance).
- Keep primary actions, navigation, and context available on touch devices.
- Check container queries or equivalent component-level adaptation when a component appears in different widths.

### G. UX writing

- Use concrete labels and active, plain language.
- Explain consequences before destructive or irreversible actions.
- Make errors actionable: what happened, what the user can do, and whether their data was preserved.
- Make empty states explain why there is no content and how to create or find it.
- Make loading states honest; do not fake progress or imply a completed operation.
- Keep button labels specific to their outcome.
- Avoid jargon, blame, vague success messages, and fabricated assurances.
- Support localization: allow text expansion, avoid concatenating fragments into sentences, and format dates, numbers, and units appropriately.

## 5. Critique rubric

Use a structured rubric to make design critique repeatable. Scores are diagnostic prompts, not an objective aesthetic truth. A score without evidence is not a finding.

Rate each applicable dimension from 1 (serious problem) to 5 (strong):
- Product and audience fit.
- Information architecture and task clarity.
- Visual hierarchy and scanability.
- Typography and readability.
- Color and contrast.
- Spacing, alignment, and responsive behavior.
- Interaction states and feedback.
- Accessibility and input-method support.
- Content specificity and trust.
- Technical quality and consistency with the existing system.

For each score below 3, record an observable example and a concrete improvement. Do not average away a critical accessibility or security defect. Do not penalize intentional, well-supported brand expression simply because it is unusual.

## 6. Bounded visual verification protocol

Use a finite quality pass instead of endless micro-editing:

1. **Before implementation:** capture the design contract, current behavior, relevant screens, and acceptance criteria.
2. **First inspection:** render or run the changed surface at the relevant desktop and mobile sizes (or relevant native device classes). Inspect visual hierarchy, spacing, overflow, content, controls, and states in one batched pass.
3. **Fix pass:** group related defects and fix the material ones together.
4. **Confirmation pass:** inspect the changed surface again, test critical interactions, and confirm the fixes. A further pass is justified only if a material defect remains or a new regression is introduced.
5. **Handoff:** report tests actually run, known limitations, assumptions, and anything requiring user-provided assets or external access.

Do not claim screenshot review, browser testing, mobile verification, accessibility testing, or successful builds unless they were actually performed. If no browser/simulator is available, state that limitation and use static/code checks that are available.

## 7. Integrating design intelligence into automated CraftLens audits

The skill's design advice must not automatically become a pile of unconditional rules. Convert it into a layered decision system:

### Layer 1 — Deterministic checks

Use reproducible evidence for:
- accessibility semantics and labels;
- contrast calculations when computed colors are available;
- overflow, breakpoints, and layout constraints when measurable;
- missing/unstable component states when source or tests demonstrate the gap;
- duplicate tokens and measurable design-system drift;
- broken links, inert controls, unsafe rendering, and known code defects.

### Layer 2 — Contextual signals

Use heuristics for:
- generic hero composition;
- repeated identical feature-card grids;
- overused gradients, glows, pills, nested cards, and decorative icons;
- vague or interchangeable copy;
- repeated section anatomy across routes;
- inconsistent visual direction or unexplained token drift.

Signals must include confidence and context. One signal should rarely trigger a high-severity finding.

### Layer 3 — Product/design reasoning

Compare the implementation against PRODUCT.md, DESIGN.md, user tasks, content, product type, platform, and acceptance criteria. Ask:
- Does this choice solve a real user or product need?
- Is it consistent with the system or an intentional documented exception?
- Does it improve comprehension, trust, or task completion?
- Is the recommendation appropriate for this product category and density?
- Would changing it create a regression elsewhere?

### Layer 4 — Recommendations

Every recommendation must name the relevant principle and propose a specific next step. Prefer a local fix over a global redesign. If a design intelligence database returns options, explain the selected recommendation in terms of context; do not blindly apply the highest-ranked style or palette.

### Layer 5 — Aggregate detection

Cluster related visual signals across a route or multiple screens. Produce one coherent aggregate finding when several symptoms share a cause, instead of flooding the user with duplicate issues. Distinguish intentional design-system consistency from generic template repetition.

### Rule contract

Where the extension supports machine-readable rules, represent each check with:
- stable ID and version;
- category and minimum audit level;
- deterministic, heuristic, or contextual method;
- evidence requirements;
- severity and confidence behavior;
- context prerequisites;
- false-positive and suppression rules;
- recommendation and safe-fix policy;
- test fixtures for positive and negative cases.

Reuse the extension's current rule schema if one exists. Do not create a parallel engine merely to accommodate this skill.

## 8. Expanded reference attribution

In addition to the Anti-AI-UI and Awesome Copilot sources listed above, this skill's added methods are informed by:

- UI/UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- UI/UX Pro Max design-system and query guidance: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/src/ui-ux-pro-max/templates/base/skill-content.md
- Impeccable frontend design skill: https://github.com/impeccable-frontend-design/skill
- Impeccable skill reference surfaced at: https://github.com/SingularityWeft/impeccable-frontend-design/blob/main/skill/SKILL.md

These links are reference starting points, not a claim that all repository files or current upstream versions have been copied. Verify the canonical repository, current revision, license, notices, and bundled data before redistributing upstream code, wording, datasets, or assets. Keep the CraftLens skill's original analysis and rules distinct from upstream assets and searchable datasets.

## Sources and attribution

This skill is an original synthesis informed by the following projects:
- Vanszs, **Anti-AI-UI** (MIT): https://github.com/Vanszs/Anti-AI-UI
- Vanszs Anti-AI-Slop skill: https://github.com/Vanszs/Anti-AI-UI/blob/main/Anti-AI-SLop/SKILL.md
- Vanszs visual pattern catalog: https://github.com/Vanszs/Anti-AI-UI/blob/main/Anti-AI-SLop/references/slop-uiux-patterns.md
- Vanszs code pattern catalog: https://github.com/Vanszs/Anti-AI-UI/blob/main/Anti-AI-SLop/references/slop-code-patterns.md
- GitHub, **awesome-copilot anti-ui-slop** (MIT): https://github.com/github/awesome-copilot/tree/main/skills/anti-ui-slop
- GitHub Awesome Copilot playbooks: `reference/new-work.md`, `operate.md`, `polish.md`, `distill.md`, `audit.md`, `ios.md`

Review upstream licenses and notices before redistributing any upstream text, data, code, or bundled assets. This file summarizes and reorganizes principles; it does not bundle upstream datasets, UI/UX Pro Max, or all 44 reference files from Vanszs.
