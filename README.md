# Buildkit

Browser tools for building sites — starting with **Pile field**: design the pile plan under shipping
containers (CAD-style, fixed and parametric piles), then take it to site and set it out with a tape
(what to measure next, which piles to move and where, minimal move plans, misread detection).

Live: https://ppodolsky.github.io/pile-setout/ · works offline once opened (installable PWA).

## Quick start

```bash
corepack enable          # pnpm (version pinned in package.json)
pnpm install
pnpm dev                 # http://localhost:5173
pnpm check               # format, lint, typecheck, unit tests
pnpm build && pnpm e2e   # production build + browser tests (desktop + phone)
```

Local browser tests can use an installed Google Chrome: `PW_CHANNEL=chrome pnpm e2e`
(otherwise `pnpm --filter @buildkit/web exec playwright install chromium` once).

## Repository layout

```
packages/                     framework-free TypeScript, unit-tested (Vitest)
  geometry/                   vectors, rigid transforms, small dense linear algebra
  survey/                     distance networks: least-squares adjustment, rigidity,
                              blunder detection (data snooping), next-measurement advisor
  pile-field/                 the pile-field domain: container catalog (ISO 668), parametric
                              pile designs, template generator, measurements, minimal-moves
                              placement search, plan pipeline, set-out instructions
apps/web/                     the React app
  src/app/                    shell, routing, theme, tool registry
  src/components/ui/          shadcn/ui components (Radix + Tailwind) — generated, keep as is
  src/components/             app-level form helpers (NumberInput, NativeSelect)
  src/drawing/                drawing kit: world-mm viewport (pan/zoom/pinch/fit), primitives
  src/tools/<tool>/           one folder per tool (feature): model, drawing, modes
    piles/model/              project types, store (persist + undo), derived hooks, editor state
    piles/drawing/            pile layers (containers, heads, dependencies) and card diagrams
    piles/design/             Design mode — CAD editor (canvas, toolbar, inspector, lists)
    piles/fieldwork/          Field work mode — measurements, advisor, plan, move cards
  e2e/                        Playwright tests (desktop + phone)
```

### Layer rules

- `packages/*` never import React, Zustand or app code (enforced by ESLint). Everything that
  computes is a pure function over plain data — easy to test, and ready to move into a Web Worker
  if it ever gets heavy.
- `geometry` ← `survey` ← `pile-field` ← `apps/web`. New tools reuse `geometry`/`survey` and add
  their own domain package.
- Inside the app, a tool talks to the shell only through its `ToolDescriptor` (`app/registry.ts`).

## Conventions

- **Units:** millimetres; angles in degrees, counter-clockwise positive.
- **Coordinates:** X along the containers, Y across, **Y up** (CAD convention). Drawings map world
  → screen in `drawing/view.ts`; shapes are drawn in screen space so lines stay crisp and text
  upright at any zoom.
- **Identity:** entities have stable `id`s; `label`s are for people and can be renamed freely.
- **Colours:** use the theme tokens (`--draw-*`, `--ok/--warn/--err/--move`, shadcn tokens) — never
  hard-coded colours — so light/dark themes just work.

## Domain model (pile field)

- **Design** — `PileSpec { id, label, def }` where `def` is
  `fixed {x, y}` · `between {from, to, by: ratio|distance}` · `polar {from, distance, angle, ref?}`.
  `resolveDesign()` evaluates definitions in dependency order and reports cycles / missing
  references. `generatePiles()` builds a design from containers joined end to end (shared joint
  piles; intermediate supports are parametric).
- **Field work** — `Measurement { a, b, reading, correctionA, correctionB }` (corrections: fixed
  extra tape length at either end, subtracted). `computePlan()` = adjustment → rigidity check →
  blunder test → minimal-moves rigid placement (proven by branch-and-bound) → move order.
  Parametric piles can be measured, or set out from their references (`setoutInstruction()`:
  along a string, or by swinging two tapes). `suggestNext()` picks the most useful next pair.

## State

`tools/piles/model/store.ts` is one Zustand store with two slices — `design` and `fieldwork` —
plus view settings. It is saved to `localStorage` (versioned; sessions from the first single-file
version are migrated) and has undo/redo (zundo; typing is grouped into one step). Derived data
(`useResolved`, `useFieldwork`) is memoised from the slices. UI-only state (selection, current
tool) lives in `model/editor.ts` and is neither saved nor undoable. Projects can be exported to /
opened from a JSON file.

## Adding things

- **A new mode for the pile tool:** add a component under `tools/piles/<mode>/` and an entry in
  `tools/piles/index.ts` → it gets a route (`#/piles/<mode>`) and a tab in the top bar.
- **A new tool:** create `tools/<tool>/index.ts` exporting a `ToolDescriptor` (modes are lazily
  loaded), add it to `app/tools.ts`, and put its domain logic in a new `packages/<tool>` package
  with tests.
- **A UI component:** `pnpm dlx shadcn@latest add <name>` inside `apps/web` (then make sure imports
  use `@/lib/utils`).
- **A drawing:** render inside `<Viewport content={box}>`; use `useView()`/`toScreen()` and the
  primitives (`Poly`, `Seg`, `Dot`, `Label`, `Cross`, `Badge`, `ScreenArrow`).

## CI / deployment

`.github/workflows/ci.yml` runs format check, lint, typecheck, unit tests, build and the browser
tests on every push and pull request; pushes to `main` deploy `apps/web/dist` to GitHub Pages.
The build reads `BASE_PATH` (the Pages sub-path); routing is hash-based, so static hosting needs no
rewrites.
