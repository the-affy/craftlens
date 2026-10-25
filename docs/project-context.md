# Project Context & Design System Baseline

CraftLens analyzes code **in context** rather than treating each file as an isolated fragment. It inspects the workspace to discover existing components, design system tokens, framework idioms, and project conventions.

---

## The Project Context Graph

```
Project Context
├── Framework (React, Next.js, Vue, Svelte, Node)
├── Language (TypeScript / JavaScript, tsconfig paths)
├── Dependencies (package.json libraries & versions)
├── Component Registry (Discovered components & exports)
├── Design System
│   ├── Colors (Brand palette, semantic mappings, CSS variables)
│   ├── Typography (Font families, weights, scale)
│   ├── Spacing (4/8/12/16/24/32px scale)
│   ├── Radius (4/8/12/16px corner curvature)
│   ├── Shadows (sm, md, lg, xl elevation tokens)
│   ├── Icons (Lucide, Radix, Heroicons, etc.)
│   └── Breakpoints (sm, md, lg, xl responsive tokens)
└── Project Design Baseline (Learned conventions)
```

---

## Design System Discovery

When analyzing a project, CraftLens automatically scans:
* `tailwind.config.*` for theme extensions, spacing scales, and custom colors
* Global stylesheets (`globals.css`, `index.css`) for `:root` CSS variables (e.g. `--primary`, `--radius`)
* Shared component directories (`components/`, `src/components/`, `ui/`, `src/components/ui/`) to catalog existing components like `Button.tsx`, `Modal.tsx`, and `Card.tsx`
* Package dependencies to detect icon libraries (e.g. `lucide-react`, `@radix-ui/react-icons`)

---

## Learning the Project Baseline

CraftLens learns the visual language that the project has deliberately chosen.

If a project intentionally adopts a vibrant purple brand color, 16px card radius, and gradient hero headers, CraftLens records these in the project baseline rather than continuously complaining about them.

```json
{
  "colors": ["#0f172a", "#3b82f6", "#10b981", "#ef4444", "#f59e0b"],
  "spacing": [4, 8, 12, 16, 24, 32, 48, 64],
  "radius": [4, 8, 12, 16],
  "typography": {
    "primaryFont": "Inter",
    "weights": [400, 500, 600, 700]
  },
  "components": ["Button", "Input", "Modal", "Card", "Table"]
}
```

---

## Project Consistency Rules

Once the baseline is established, CraftLens detects uncoordinated additions that erode system consistency:

* **CX-013 (Existing Component Should Be Reused):** Flags when AI assistants generate raw styled `<button>` elements when the project already maintains a standard `<Button>` component with centralized accessible focus rings and variants.
* **CX-004 (Spacing Scale Violation):** Detects arbitrary one-off spacing values (e.g. `p-[19px]`) and snaps them to the nearest approved token (`p-4` / `16px`).
* **CX-005 (Radius Violates System):** Flags arbitrary corner curvature (e.g. `rounded-[23px]`) and snaps to the design system scale (`rounded-[16px]`).

---

## Generating Project Rules

To codify detected conventions into declarative project rules:
1. Run `CraftLens: Generate Project Rules` from the command palette.
2. Review detected high-confidence conventions:
   - `✓ 8px spacing system`
   - `✓ 12px card radius`
   - `✓ Button component`
   - `✓ Modal component`
   - `✓ Brand color palette`
3. Confirm generation: CraftLens writes `.craftlens/rules/project-conventions.yml` and immediately registers the rules in the active engine.
