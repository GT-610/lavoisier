[简体中文](README.md)

# Lavoisier</h1>

A 2D chemistry sandbox for the browser, where you arrange benches freely and a rule engine decides everything that follows.

## Highlights

| Highlight | Why it matters |
| --- | --- |
| A rule-driven reaction engine | Reagents sharing a vessel, combined with temperature, heating and stirring, match a reaction that shows up as colour change, bubbles, precipitate, heat, glow or an explosion |
| Several benches at once | Every bench keeps its own canvas, apparatus, temperatures and log, and can be created, renamed, duplicated and deleted |
| 8 kinds of apparatus | Beakers, test tubes, flasks, measuring cylinders, evaporating dishes, alcohol lamps, glass rods and funnels, all draggable, rotatable and stackable |
| 30 shelf reagents | Plus 25 products that only a reaction can produce, covering acids, bases, indicators, catalysts, precipitates and common gases |
| Entirely client-side | No backend and no accounts; a bench exports to a JSON file and imports again |
| Unit tests for the logic layer | 166 Vitest cases covering the reaction engine, catalogue integrity, the store, and the geometry and colour helpers |

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                   React component tree                   │
│ Shelf / BenchCanvas / Inspector / LogPanel               │
└───────────────────────────┬──────────────────────────────┘
                            │ getState() every frame
                            ▼
┌──────────────────────────────────────────────────────────┐
│           Zustand store (keyed by workspaceId)           │
│ apparatus / contents / temperature / log                 │
│ contentsRevision drives mirror sync                      │
└───────────────────────────┬──────────────────────────────┘
                            │ read every frame
                            ▼
┌──────────────────────────────────────────────────────────┐
│              useSimulation frame loop (rAF)              │
│ ReactionEngine ──▶ ParticleSystem ──▶ drawScene          │
│ region detection / temperature / rule match              │
└───────────────────────────┬──────────────────────────────┘
                            │ commitSimulation write-back
                            └──────────────▶ Zustand store
```

The frame loop lives entirely outside React: each frame it reads the active bench through the store's imperative API, advances that bench's own `ReactionEngine`, and paints. Only the rate-limited write-back travels into React, so the canvas runs at display refresh rate while the component tree re-renders at most about eight times a second, the write-back interval being 0.12 s.

## Usage Example

A metal-and-acid reaction, driven entirely with the mouse:

1. A bench already exists when the page opens; use **+ 新建** in the top tab strip to add more, and double-click a tab to rename it in place.
2. Drag a **beaker** from the left-hand instrument library onto the canvas. It is selected as soon as it lands.
3. Switch to the reagent library, find **zinc granules** in the solid reagents group, and drag them into the beaker; or double-click the reagent entry with a vessel selected to add it straight to that vessel.
4. Add **dilute hydrochloric acid** from the common acids group to the same beaker.
5. Watch the canvas and the right-hand panels: bubbles keep rising from the zinc, the experiment log gains a line per event, and the temperature in the inspector climbs, because `Zn + 2HCl → ZnCl₂ + H₂↑` is exothermic.

To skip the manual setup, use the experiment presets in the toolbar; the zinc-and-acid preset lays this scene out in one click. The remaining presets demonstrate neutralisation heat, a blue precipitate, catalytic decomposition, an indicator colour change, and an oxyhydrogen explosion.

## Installation

Requires [Bun](https://bun.sh) as the runtime and package manager.

```bash
bun install
```

## Quick Start

```bash
bun run dev
```

Vite prints the local address, `http://localhost:5173` by default. Open it to reach the bench, and you can start from the usage example above.

## Development commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run build` | Typecheck, then build into `dist/` |
| `bun run preview` | Preview the built output locally |
| `bun run lint` | Lint with oxlint |
| `bun run test` | Run the unit tests |
| `bun run test:watch` | Run the unit tests in watch mode |
| `bun run check` | Typecheck, then oxlint, then the unit tests |
| `bun run deploy` | Build, then deploy to Cloudflare Pages with Wrangler |

## Tests

The suite is Vitest, with 166 cases across five files. It covers the logic outside the React components; test files sit next to the code they exercise, named `*.test.ts`.

`vitest.config.ts` is separate from `vite.config.ts` because the tests need neither the React plugin nor Tailwind.

| File | Covers |
| --- | --- |
| `src/engine/reactionEngine.test.ts` | Rule matching and priority; limiting-reactant accounting; product generation; catalysts and indicators surviving the reaction; temperature integration and the boiling clamp; the heat, stir and catalyst gates; explosions; log cooldown; isolation between vessels |
| `src/data/catalogue.test.ts` | Catalogue integrity; unique ids; no dangling references from the rule table; reachability, so that no shelved reagent is unconsumable and no declared product is unproducible |
| `src/store/labStore.test.ts` | Workspace create, rename, duplicate and delete; isolation between benches; log cap and de-duplication; capacity clamping; the `contentsRevision` contract; export and import round trip, including sanitising of malformed files |
| `src/interaction/hitTest.test.ts` | Canvas coordinate conversion; silhouette hit testing, covering the round bottom of a test tube and the narrow neck of a flask; the rotation handle; picking the topmost instrument |
| `src/utils/math.test.ts` | Colour parsing and blending; point rotation and rotated bounds; rectangle intersection; `cx` and `uid` |

Two groups of assertions cover faults that raise nothing at runtime. The reachability audit catches a reagent on the shelf that no rule consumes, or a product that no rule produces. The temperature tests catch a flame ceiling below the temperature a decomposition rule needs. Either fault leaves the interface working and the feature inert, so both are checked directly.

## Layout

```text
src/
├─ components/     # UI: workspace tabs, apparatus and reagent library, inspector, log
├─ data/           # reagent, apparatus and reaction-rule definitions
├─ engine/         # reaction engine (region detection, rule matching) and particles
├─ interaction/    # drag payload and canvas hit testing
├─ render/         # canvas scene composition and apparatus drawing
├─ store/          # multi-workspace Zustand store and scoped selectors
├─ types/          # shared type definitions
└─ utils/          # shared helpers (colour blending, geometry, ids)
```

## Simulation model

The engine is a macro state machine with region detection. It solves no fluid dynamics and simulates no individual molecules. Each frame it:

1. syncs a mirror of every vessel against the store's `contentsRevision`, rebuilding only after a user action;
2. tests geometrically which vessels sit in the plume of a lit alcohol lamp and which are touched by a glass rod;
3. integrates temperature: heating, cooling towards ambient, and reaction enthalpy. A vessel holding liquid water stays at its boiling point until the water is gone, and only then climbs further;
4. takes the highest-priority rule whose reactants are all present and whose conditions hold, advancing it by `rate × temperature × stirring`;
5. applies the effects: colour, opacity, bubbles, precipitate, glow, explosion.

The engine owns the numbers while it runs, and writes back to React through a single `commitSimulation` call every 0.12 s. The log keeps the most recent 120 entries, collapse-deduplicated.

## Deploying to Cloudflare Pages

```bash
bun run deploy
```

This builds, then runs `wrangler pages deploy dist`. The project has no top-level `404.html`, which already puts Pages into single-page-application mode, and `public/_redirects` states the fallback to `index.html` explicitly so that adding a `404.html` later cannot change routing by accident. `public/_headers` supplies baseline security headers and the static asset caching policy.

## License

[GNU AGPL v3.0](./LICENSE) (`AGPL-3.0-only`). Section 13 covers network use: if you modify the program and let users interact with it over a network, your version has to offer them the corresponding source.
