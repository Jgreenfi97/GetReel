@AGENTS.md

# GetReel

A search engine for half-remembered films and TV series: a fuzzy description goes to Claude, the guesses are enriched with TMDB data (film or TV catalogue; guessed episodes are checked against the real episode list), and the top match gets a YouTube scene clip. See README.md for the product overview and setup.

## Commands

- `npm run dev`: dev server on :3000 (demo mode when no keys are set)
- `npm run check`: lint + typecheck + unit tests (run before committing)
- `npm run build`: production build (also validates Cache Components rules)
- `npm run marble -- --seed N`: regenerate marble textures (Python 3 + numpy + Pillow)
- `npm run artifact`: build the single-page Claude artifact into `artifact/dist/` (Node 22.18+; reads `src/lib/demo.ts` directly)

## Architecture

- `src/lib/search.ts` is the pipeline: identify (`claude.ts` or `demo.ts`) → enrich (`tmdb.ts`) → episode check → clip (`youtube.ts`). Steps after identify must degrade gracefully: catch, record a notice, keep going.
- Every title has a `kind` ("movie" | "tv"). TMDB ids repeat across the two catalogues, so always key by kind + id (dedupe, routes `/movie/[id]` and `/tv/[id]`, links).
- Pure logic lives in `*-core.ts`, `identification.ts` and `search-params.ts` and is unit-tested; I/O wrappers are `server-only` and cached with `"use cache"` + `cacheLife`.
- Searches are fully described by the URL (`q`, repeated `more`, repeated `not`), built and parsed only via `search-params.ts`.
- `ResultsView` is keyed by the search URL so client state (ruled-out films, the selected film) resets on each new search.

## Conventions

- Next.js 16 with `cacheComponents`: runtime data (`searchParams`, `params`, `headers()`) must be read inside `<Suspense>`; don't put `Date.now()`/`Math.random()` in prerendered components. Read the bundled docs before using unfamiliar APIs.
- Claude calls use the official SDK, structured outputs (`betaZodOutputFormat`), and default to `claude-opus-5-5`. Backup models (`fallbacks.ts`): a pinned chain (Opus 5, then Opus 4.8; array form, beta `server-side-fallback-2026-06-01`) filtered by the Models API's `allowed_fallback_models`, else `fallbacks: "default"` (beta `-2026-07-01`). The two beta headers are not interchangeable. Check the `claude-api` skill before changing any of this.
- Styling: global tokens and utilities in `src/app/globals.css` (`.btn`, `.chip`, `.slab`, `.onyx`, `.eyebrow`, `.foil`), with component styles in CSS Modules. Keep gold text for large or decorative type; body text uses the ink tokens.
- Ornaments are computed SVG in `src/components/ornaments.tsx`; gold gradients are referenced by id from `<GoldDefs />` in the root layout.
- TMDB images are stored as `https://image.tmdb.org/t/p/<kind>/<file>` refs; the custom image loader picks the real size.
- Never let crawlers or prefetches trigger paid searches: `/search` is disallowed in robots.txt and links to searches use default (shell-only) prefetching.
- `artifact/template.html` is a standalone, plain-JS port of the site for claude.ai (live search via the artifact `sample` capability). It mirrors the prompt in `claude.ts` and logic from `identification.ts`, `format.ts`, `locale.ts` and `findDemoCase`: keep them in step (table in `artifact/README.md`). Republish to the existing artifact URL rather than creating a new one.
