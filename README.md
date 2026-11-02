<p align="center">
  <img src="src/app/opengraph-image.png" alt="GetReel — For the film on the tip of your tongue." width="720" />
</p>

# GetReel

**A search engine for the movies you can't quite remember.** Describe a scene, a line of dialogue, a face, a feeling, however hazy, and GetReel works out which film you mean, then rolls the clip.

- **Ask like a person.** "That black-and-white movie where the husband keeps dimming the lights" works.
- **Ranked guesses, with reasons.** The likeliest film is the *feature presentation*. Up to four *contenders* sit beside it, each with a confidence score and the clues it matches or misses.
- **The scene, not just the title.** The top match plays the moment you described from YouTube, or the official trailer.
- **Narrow it down.** Rule films out, answer the archivist's follow-up question or add a detail, and the search builds on itself. Every search lives in the URL, so it can be shared and bookmarked.
- **Upscale by design.** White Calacatta marble, gilt hairlines, Persian geometry (the khatam star, the iwan arch, star-and-cross tilework) and black-tie Hollywood glamour.

---

## 1. Try it on your computer (2 minutes, no keys needed)

GetReel runs in **demo mode** until you add API keys. Demo mode includes six hand-picked example searches, so you can explore the whole design.

1. Install **Node.js 20.9 or newer**. The LTS version from [nodejs.org](https://nodejs.org) works.
2. Open a terminal in this folder and install the dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open **http://localhost:3000** in your browser.

## 2. Switch on live search

Copy the example settings file, then fill in the keys you have:

```bash
cp .env.example .env.local
```

| Key | What it adds | Where to get it | Cost |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | **Required for real searches.** Claude works out which film is being described. | [platform.claude.com → Settings → API keys](https://platform.claude.com/settings/keys) (add billing credit first) | Pay per search (see [Costs](#costs)) |
| `TMDB_API_KEY` | Posters, cast, trailers, ratings, "where to watch" and the film pages | Create a free account at [themoviedb.org](https://www.themoviedb.org), then **Settings → API**. Paste the long *API Read Access Token* (starts with `eyJ`) or the shorter *API Key*; both work. | Free for non-commercial use |
| `YOUTUBE_API_KEY` | Finds the *exact scene* someone described, instead of only the trailer | [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com): create a project, enable **YouTube Data API v3**, then **Credentials → Create credentials → API key** | Free (about 100 scene searches a day) |

Restart `npm run dev` after editing `.env.local`. To confirm which services are switched on, open **http://localhost:3000/api/health**. It shows on/off flags only, never the keys. The About page shows the same status.

> Only the Anthropic key is required for real searches. Without TMDB, results still work, but each film shows an engraved marble plaque instead of a poster. Without YouTube, the top match plays its official trailer or clip from TMDB.

## 3. Put it on the internet

The simplest host is [Vercel](https://vercel.com), which is free for personal projects:

1. Push this repository to GitHub (it's already connected).
2. On Vercel, choose **Add New → Project** and import `GetReel`. The defaults are correct.
3. Under **Environment Variables**, add the same keys as in your `.env.local`.
4. Click **Deploy**. Vercel gives you a web address, and every push to GitHub redeploys automatically.

Any host that runs Node.js works (`npm run build`, then `npm start`).

---

## How it works

```
 "two magicians in victorian london…"
                │
                ▼
 ┌──────────────────────────────┐   Claude reads the description and returns up to five
 │ 1. Identify   (Claude)       │   films as structured JSON: title, year, confidence,
 └──────────────────────────────┘   reasons, matched/missed clues, the scene, a clip query
                │
                ▼
 ┌──────────────────────────────┐   Each guess is matched to TMDB: confirms title and year,
 │ 2. Enrich     (TMDB)         │   adds poster, cast, trailers, rating, where to watch
 └──────────────────────────────┘
                │
                ▼
 ┌──────────────────────────────┐   The top guess gets a YouTube search for the scene;
 │ 3. Clip       (YouTube)      │   the others use official clips/trailers from TMDB
 └──────────────────────────────┘
```

- **Graceful degradation.** Only step 1 is essential. If TMDB or YouTube is missing or fails, results still appear with less detail and a short note.
- **Searches live in the URL:** `/search?q=<description>&more=<extra clue>&not=<Title (Year)>`. "Not it" rules a film out instantly on the page; "Refine" and "Keep looking" run a new search that remembers what was ruled out.
- **Caching.** Identical searches are cached for hours, TMDB lookups for days and YouTube scene searches for weeks, so repeats are instant and free.
- **Protection.** Each visitor is limited to `SEARCH_RATE_LIMIT_PER_HOUR` searches (default 30), and `robots.txt` keeps search engines off `/search`, so crawlers can't run up your bill.
- **JSON API.** `POST /api/search` with `{"description": "…", "clues": [], "excluded": []}` returns the same results as the site, for future apps or extensions.

### The AI part

`src/lib/claude.ts` uses the official Anthropic SDK:

- **Model:** `claude-opus-5-5` at `medium` effort by default, the most capable model, because recalling obscure films is the whole product. Change it with `ANTHROPIC_MODEL` / `ANTHROPIC_EFFORT`.
- **Structured outputs:** the response is constrained to a JSON schema (`src/lib/identification.ts`), so results always parse.
- **Prompt caching:** the system prompt is cached, so repeat searches pay less for input.
- **Refusal fallback:** if a safety filter wrongly declines a harmless description, the API retries on Anthropic's recommended fallback model (`fallbacks: "default"`).

## Costs

- **Claude:** with the default model, a search typically costs a few US cents. Repeat searches are served from cache for free. To spend less, set `ANTHROPIC_EFFORT=low` or use a smaller model such as `ANTHROPIC_MODEL=claude-sonnet-5-5`; test whether the answers are still good enough. You can also set a monthly spend limit in the Claude Console.
- **TMDB:** free for non-commercial projects, with attribution (already in the footer and About page). A commercial launch needs a TMDB commercial license.
- **YouTube:** the free quota is 10,000 units a day and each scene search uses 100, so about 100 new scene searches a day. GetReel only searches for the top match and caches results. When the quota runs out, it falls back to trailers.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (none) | Enables live search |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude model used for identification |
| `ANTHROPIC_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh` or `max`: thinking depth vs. speed and cost |
| `TMDB_API_KEY` | (none) | Posters, credits, trailers, where to watch |
| `YOUTUBE_API_KEY` | (none) | Exact-scene search for the top match |
| `WATCH_REGION` | `US` | Two-letter country for streaming listings |
| `SEARCH_RATE_LIMIT_PER_HOUR` | `30` | Searches per visitor per hour (live mode only) |
| `GETREEL_DEMO` | `0` | Set to `1` to force demo mode even with keys |
| `GETREEL_DEMO_DELAY_MS` | `1400` | How long demo searches "think", so the loading screen plays |
| `SITE_URL` | (auto on Vercel) | Public address, used for social-share links |

---

## Project tour

```
src/
  app/
    page.tsx              Home: the arch hero, search box, "Now showing" marquee, how it works
    search/page.tsx       Results (streams in behind the loading screen)
    movie/[id]/page.tsx   Film page: backdrop, gilt poster, clips, cast in arch frames, where to watch
    about/page.tsx        About, setup status, privacy, credits
    api/search/route.ts   JSON search API
    api/health/route.ts   Which services are switched on
    globals.css           Design tokens: colors, type, buttons, chips, marble surfaces
    opengraph-image.png   Social share card
  components/
    ornaments.tsx         Logo mark, khatam stars, Persian arch, tile bands, sunburst (all computed SVG)
    ResultsView.tsx       Feature presentation, contenders, Not it / Undo, refine
    SearchBox.tsx         The main search field (works even before JavaScript loads)
    ClipPlayer.tsx        The "screening room": loads YouTube only when you press play
    …                     Logo, Poster, ConfidenceMeter, RefineBox, ReelLoader, WatchProviders, …
  lib/
    search.ts             The pipeline: identify → enrich → clip, plus rate limiting
    claude.ts             Claude call, system prompt, error handling
    identification.ts     The JSON schema Claude answers with, and clean-up rules
    tmdb.ts / tmdb-core.ts            TMDB client and its pure matching/mapping logic
    youtube.ts / youtube-core.ts      Scene search and result picking
    demo.ts               The six demo searches
    search-params.ts      URL format for searches
scripts/generate-marble.py   Generates the seamless marble textures
tests/                       Unit tests (Vitest)
```

## Design system

- **Type:** *Cinzel* (Roman inscriptional capitals; its lowercase are small caps, so "GetReel" reads as an inscription) for the wordmark and labels, *Cormorant Garamond* for titles and prose, and *Jost* (an Art Deco-era geometric sans) for interface text.
- **Color:** marble whites, warm ink, and a gold ramp (`--gold-100` to `--gold-900`) with a foil gradient for gilded lettering, plus black Nero Marquina for the "screening room", marquee and footer. All tokens live at the top of `src/app/globals.css`.
- **Ornament:** the logo is a film reel drawn as a Persian *khatam* (eight-pointed star) ringed with marquee bulbs. Arches, dividers, numerals and the star-and-cross tile pattern come from the same geometry in `src/components/ornaments.tsx`.
- **Marble:** the textures are procedurally generated and tile seamlessly. To try a different slab, run `npm run marble -- --seed 42` (needs Python 3 with `numpy` and `Pillow`).
- **Accessibility:** WCAG AA text contrast, visible gold focus rings, a skip link, live announcements when results change, and reduced motion for people who prefer it.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server at http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | Run the unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, including generated route types |
| `npm run check` | All of the above checks |

This project uses **Next.js 16** with *Cache Components*. Its rules differ from older Next.js; see `AGENTS.md` and the guides bundled in `node_modules/next/dist/docs/`.

## Ideas for what's next

- **TV shows and episodes:** people half-remember those too.
- **On-demand scene search for every contender**, not only the top match.
- **Stream results as they arrive:** show the top guess before the others finish.
- **A shared rate limit and cache** (e.g. Upstash Redis) for a busy public site.
- **Web search for brand-new releases** beyond the model's knowledge.
- **Search history and "found it" stats**, plus an evaluation set of tricky descriptions to measure accuracy as the prompt evolves.
- **Upload a screenshot** of a scene, or **describe by voice**.
- **A black-marble evening theme.**

## Credits

Film data and images from [TMDB](https://www.themoviedb.org). *This product uses the TMDB API but is not endorsed or certified by TMDB.* Where-to-watch listings by [JustWatch](https://www.justwatch.com). Clips play from YouTube. Film identification by Claude, from Anthropic.
