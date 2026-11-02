# GetReel as a Claude artifact

A single-page version of GetReel that runs inside Claude, so friends and family can try it from a link without any hosting or API keys. It is published at **https://claude.ai/artifact/5B4GnF6YyGfRTkvEgcXPdi**, which stays private until it is shared from the page's **Share** menu.

## What it does

- **The demo reel works for everyone.** The ten example searches (six films, four series) answer instantly.
- **Anything else is asked of Claude**, through the artifact's `sample` capability, using the viewer's own Claude account. Their first search asks for permission. If they decline, aren't signed in, or Claude isn't available to them, the page searches the demo reel instead and says why.
- **Results work like the site:** the feature presentation, a confidence meter, the exact episode for a series, the other contenders, Not it / Undo, the follow-up question, adding a detail and Keep looking.
- **Light and dark:** white marble in light mode, black Nero Marquina in dark mode.

What differs from the site comes from what an artifact page is allowed to load:

- **No embedded video.** "Roll the clip" opens a YouTube search in a new tab.
- **No TMDB.** Posters are engraved marble plaques. For live searches, the cast, running time, seasons and air dates come from Claude without the site's TMDB cross-check, so a detail can occasionally be off. The demo reel's facts were checked by hand.
- **No search URLs.** Each search lives in the page until the viewer starts a new one.

## Build

```bash
npm run artifact
```

This needs **Node 22.18 or newer**, because it reads the demo reel straight from `src/lib/demo.ts` using Node's built-in TypeScript support. It writes two files to `artifact/dist/` (not committed):

| File | What it is |
| --- | --- |
| `getreel.html` | The page to publish. It has no `<!doctype>`, `<html>` or `<body>`: the artifact host wraps the page in its own. |
| `preview.html` | The same page inside a copy of that wrapper, to open in a browser. Opened from disk it has no connection to Claude, so it runs on the demo reel only. |

Along the way the build inlines the marble textures from `public/textures/` as data URIs (artifacts can't load outside images), draws the ornaments with the same geometry as `src/components/ornaments.tsx`, and checks that the page's script parses.

## Publish an update

In Claude Code, publish `artifact/dist/getreel.html` with the Artifact tool. Pass the URL above as `url` so the existing link updates rather than creating a new artifact, and keep `capabilities: {"sample": {}}` so live search stays on.

## Keeping it in step with the site

The page's script is plain JavaScript with its own copies of a few parts of the app. When you change one of these, make the same change in `template.html`:

| In the app | In `template.html` |
| --- | --- |
| `SYSTEM_PROMPT` in `src/lib/claude.ts` | `ARCHIVIST`, which adds a `details` section because there is no TMDB |
| `src/lib/identification.ts` | `normalizeTitle`, `toCandidate`, `toIdentification`, `isRuledOut` |
| `src/lib/format.ts` and `src/lib/locale.ts` | the formatting and language helpers |
| `findDemoCase` in `src/lib/demo.ts` | `findDemoCase` |
| `src/app/globals.css` and the component CSS | the `<style>` block, which also defines the dark theme |

The demo reel itself is never copied by hand: every build reads it from `src/lib/demo.ts`.
