# Buildkit

Browser tools for building sites — starting with **Pile field**: design the pile plan under shipping
containers as a CAD sketch (piles + geometric constraints), then take it to site and set it out with a
tape (what to measure next, which piles to move and where, minimal move plans, misread detection).

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
  sketch/                     2D geometric constraint solver (CAD sketch): fix, distance, ΔX/ΔY,
                              horizontal/vertical, angle, ratio, on-line; DOF + conflicts
  survey/                     distance networks: least-squares adjustment, rigidity,
                              blunder detection (data snooping), next-measurement advisor
  pile-field/                 the pile-field domain: container catalog (ISO 668), pile sketches and
                              the template generator, measurements, minimal-moves placement
                              search, plan pipeline, ordered set-out instructions
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
- `geometry` ← `sketch`, `survey` ← `pile-field` ← `apps/web`. New tools reuse `geometry`, `sketch`
  and `survey` and add their own domain package.
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

- **Design** — a sketch: `piles` (points with a stable `id`, a `label`, a solved position and a
  field-work role `measure | derive`) plus `constraints` (`@buildkit/sketch`). `solveSketch()` is a
  Levenberg–Marquardt solver from the current positions with per-coordinate damping (free
  directions don't move; dragging pulls a point as far as constraints allow); it reports DOF, fully
  determined points and conflicting constraints. Stored positions are always the solved ones.
  `generateDesign()` builds a fully constrained sketch from containers joined end to end.
- **Field work** — `Measurement { a, b, reading, correctionA, correctionB }` (corrections: fixed
  extra tape length at either end, subtracted). `computePlan()` = adjustment → rigidity check →
  blunder test → minimal-moves rigid placement (proven by branch-and-bound) → move order.
  Piles marked `derive` are either measured too, or set out afterwards (`setoutPlan()`): in an order
  where each uses only piles already in place — on the string between the two piles it lies between,
  or by swinging two tapes from its constraint partners / nearest placed piles. `suggestNext()` picks
  the most useful next pair to measure.

## State

`tools/piles/model/store.ts` is one Zustand store with two slices — `design` and `fieldwork` —
plus view settings. It is saved to `localStorage` (versioned; sessions from the first single-file
version are migrated) and has undo/redo (zundo; typing is grouped into one step). Derived data
(`useResolved`, `useFieldwork`) is memoised from the slices. UI-only state (selection, current
tool) lives in `model/editor.ts` and is neither saved nor undoable. Projects can be exported to /
opened from a JSON file.

## Languages

`apps/web/src/i18n`: i18next with typed resources — English (`locales/en`) is the source; each
other language (`locales/ru`, …) is typed `Translation<typeof en>`, so a missing key fails the
build, and a unit test checks keys, plural forms (Russian: one / few / many / other) and
`{{placeholders}}`. The language comes from the user's choice (globe menu, saved per device), else
the browser. Numbers and dates follow it (`fmt()` → `5 858,5` in Russian; inputs accept a comma).
Components use `useTranslation('<namespace>')`; framework-free packages stay English and the app
translates their output by id (selection actions, constraint kinds, snap labels).

To add a language: add it to `LANGUAGES` in `i18n/index.ts`, copy `locales/en` to `locales/<code>`
as `Translation<…>` files, translate, and register it in `i18n/index.ts`.

## Adding things

- **A new constraint type:** add it to `packages/sketch/src/constraints.ts` (residuals + points), a
  glyph in `tools/piles/drawing/constraints.tsx`, metadata in `design/meta.ts`, and a selection
  action in `model/actions.ts` if it is created from a selection.
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
