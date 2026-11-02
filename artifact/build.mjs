// Builds the Claude artifact version of GetReel (see artifact/README.md):
// template.html + computed ornaments + inlined marble textures + the demo reel,
// read straight from src/lib/demo.ts so the two never drift apart.
//
// Reading the app's TypeScript needs Node's built-in type stripping (22.18+).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import module from "node:module";
import vm from "node:vm";

if (!process.features.typescript || typeof module.registerHooks !== "function") {
  console.error(`Building the artifact needs Node 22.18 or newer (this is ${process.version}).`);
  process.exit(1);
}

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved;
    try {
      resolved = nextResolve(specifier, context);
    } catch (error) {
      // The app's imports leave off the ".ts" extension ("./identification").
      if (!specifier.startsWith(".") || /\.[cm]?[jt]s$/.test(specifier)) throw error;
      resolved = nextResolve(`${specifier}.ts`, context);
    }
    // The app's TypeScript is ES modules; saying so spares Node from guessing (and warning).
    return resolved.url.endsWith(".ts") ? { ...resolved, format: "module-typescript" } : resolved;
  },
});

const { DEMO_CASES } = await import("../src/lib/demo.ts");
const { nestQuotes } = await import("../src/lib/format.ts");

const here = (path) => new URL(path, import.meta.url);
const webp = (file) =>
  `data:image/webp;base64,${readFileSync(here(`../public/textures/${file}`)).toString("base64")}`;

// ── Ornaments (the same geometry as src/components/ornaments.tsx) ────────

const KHATAM_INNER = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);
const fmt = (n) => Number(n.toFixed(2)).toString();

function starPath(cx, cy, outer, inner = outer * KHATAM_INNER, points = 8) {
  const parts = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    parts.push(`${fmt(cx + radius * Math.cos(angle))} ${fmt(cy + radius * Math.sin(angle))}`);
  }
  return `M${parts.join("L")}Z`;
}

const circlePath = (cx, cy, r) =>
  `M${fmt(cx + r)} ${fmt(cy)}A${r} ${r} 0 1 0 ${fmt(cx - r)} ${fmt(cy)}A${r} ${r} 0 1 0 ${fmt(cx + r)} ${fmt(cy)}Z`;

// The khatam star with eight reel holes and a hub, cut out with even-odd fill.
let REEL_STAR = starPath(50, 50, 31);
for (let i = 0; i < 8; i++) {
  const a = -Math.PI / 2 + (i * Math.PI) / 4;
  REEL_STAR += circlePath(50 + 15.2 * Math.cos(a), 50 + 15.2 * Math.sin(a), 4.1);
}
REEL_STAR += circlePath(50, 50, 5.4);

const BULBS = Array.from({ length: 28 }, (_, i) => {
  const a = (i * 2 * Math.PI) / 28;
  return `<circle cx="${fmt(50 + 44.7 * Math.cos(a))}" cy="${fmt(50 + 44.7 * Math.sin(a))}" r="1.05"/>`;
}).join("");

const reelSymbol = (id, gradient) =>
  `<symbol id="${id}" viewBox="0 0 100 100">` +
  `<circle cx="50" cy="50" r="48" fill="none" stroke="url(#${gradient})" stroke-width="1.6"/>` +
  `<circle cx="50" cy="50" r="41.4" fill="none" stroke="url(#${gradient})" stroke-width="0.9"/>` +
  `<g fill="url(#${gradient})">${BULBS}<path d="${REEL_STAR}" fill-rule="evenodd"/><circle cx="50" cy="50" r="2.4"/></g>` +
  `</symbol>`;

// Stop colors come from CSS classes, so the gilt follows the page's theme.
const DEFS = `<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<linearGradient id="gr-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="g1"/><stop offset="0.28" class="g2"/><stop offset="0.48" class="g3"/><stop offset="0.66" class="g4"/><stop offset="1" class="g5"/></linearGradient>
<linearGradient id="gr-gold-bright" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="gb1"/><stop offset="0.45" class="gb2"/><stop offset="1" class="gb3"/></linearGradient>
<radialGradient id="gr-ray-fade" cx="0.5" cy="0.5" r="0.5"><stop offset="0" class="ray-a"/><stop offset="0.55" class="ray-b"/><stop offset="1" class="ray-c"/></radialGradient>
<pattern id="pt-khatam" width="32" height="32" patternUnits="userSpaceOnUse"><path d="${starPath(16, 16, 16)}" fill="none" class="pt-line" stroke-width="0.8"/></pattern>
${reelSymbol("reel", "gr-gold")}
${reelSymbol("reel-bright", "gr-gold-bright")}
<symbol id="khatam" viewBox="0 0 40 40"><path d="${starPath(20, 20, 19)}" fill="url(#gr-gold)"/></symbol>
<symbol id="numeral-star" viewBox="0 0 100 100"><path d="${starPath(50, 50, 47)}" class="numeral-fill" stroke="url(#gr-gold)" stroke-width="1.6"/><path d="${starPath(50, 50, 39)}" fill="none" stroke="url(#gr-gold)" stroke-width="0.7"/></symbol>
</defs></svg>`;

// A Persian iwan arch: four-centred, vertical at the springing, gently pointed at the apex.
const OUTER = "M8 420 L8 330 C8 196 318 134 500 14 C682 134 992 196 992 330 L992 420";
const INNER = "M40 420 L40 336 C40 214 336 156 500 52 C664 156 960 214 960 336 L960 420";
const ARCH_CROWN = `<svg class="arch-crown" viewBox="0 0 1000 420" aria-hidden="true" focusable="false"><path d="${OUTER} Z ${INNER} Z" fill="url(#pt-khatam)" fill-rule="evenodd" opacity="0.8"/><path d="${OUTER}" fill="none" stroke="url(#gr-gold)" stroke-width="1.4" vector-effect="non-scaling-stroke"/><path d="${INNER}" fill="none" stroke="url(#gr-gold)" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="${starPath(500, 30, 13)}" fill="url(#gr-gold)"/></svg>`;

// Art Deco searchlight rays, old Hollywood's premiere-night sunburst.
const rays = [];
for (let i = 0; i < 56; i++) {
  const a = (i * 2 * Math.PI) / 56;
  const long = i % 2 === 0;
  const len = long ? 50 : 38;
  const half = (Math.PI / 56) * (long ? 0.32 : 0.22);
  rays.push(
    `M50 50L${fmt(50 + len * Math.cos(a - half))} ${fmt(50 + len * Math.sin(a - half))}L${fmt(50 + len * Math.cos(a + half))} ${fmt(50 + len * Math.sin(a + half))}Z`,
  );
}
const SUNBURST = `<svg class="sunburst" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><path d="${rays.join("")}" fill="url(#gr-ray-fade)"/></svg>`;

const DIVIDER = `<div class="divider" aria-hidden="true"><span class="divider-line"></span><span class="divider-diamond"></span><svg class="divider-star" viewBox="0 0 40 40" focusable="false"><use href="#khatam"/></svg><span class="divider-diamond"></span><span class="divider-line"></span></div>`;

// ── The demo reel as buttons: the home page's "Or try" chips and the marquee ──

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TRY = ["The volleyball friend", "Deadly playground games", "“Pivot!”", "The pink hotel"];
const reel = DEMO_CASES.map((d, i) => ({ label: d.label, prompt: d.prompt, kind: d.candidates[0].kind, i }));

const tryChips = TRY.map((label) => {
  const d = reel.find((r) => r.label === label);
  if (!d) throw new Error(`"${label}" is not in the demo reel (src/lib/demo.ts)`);
  return `<li><button type="button" class="chip" data-demo="${d.i}">${esc(d.label)}</button></li>`;
}).join("\n                ");

const tile = (d) =>
  `<li><button type="button" class="reel-tile" data-demo="${d.i}"><span class="reel-tile-label">${esc(d.label)}</span><span class="reel-tile-prompt">“${esc(nestQuotes(d.prompt))}”</span></button></li>`;
const filmTiles = reel.filter((d) => d.kind === "movie").map(tile).join("\n            ");
const showTiles = reel.filter((d) => d.kind === "tv").map(tile).join("\n            ");

// ── Assemble ─────────────────────────────────────────────────────────────

let html = readFileSync(here("template.html"), "utf8");

// The dark tokens are written once, inside the prefers-color-scheme block, and
// repeated here for viewers who pick dark explicitly.
const dark = /\/\*DARK-START\*\/([\s\S]*?)\/\*DARK-END\*\//.exec(html)[1].trim().replace(/\n\s+/g, "\n  ");

const values = {
  MARBLE_WHITE: webp("marble-white.webp"),
  MARBLE_WHITE_SM: webp("marble-white-sm.webp"),
  MARBLE_BLACK: webp("marble-black.webp"),
  DARK_TOKENS: dark,
  DEFS,
  ARCH_CROWN,
  SUNBURST,
  DIVIDER,
  TRY_CHIPS: tryChips,
  FILM_TILES: filmTiles,
  SHOW_TILES: showTiles,
  DEMO_JSON: JSON.stringify(DEMO_CASES).replace(/</g, "\\u003c"),
};
for (const [key, value] of Object.entries(values)) {
  if (!html.includes(`{{${key}}}`)) throw new Error(`template.html has no {{${key}}} placeholder`);
  html = html.replaceAll(`{{${key}}}`, () => value);
}
const leftover = html.match(/\{\{[A-Z_]+\}\}/);
if (leftover) throw new Error(`template.html placeholder ${leftover[0]} was not filled`);

// Parse (without running) the page script, so a syntax error fails the build.
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
new vm.Script(script, { filename: "artifact/template.html <script>" });

const dist = here("dist/");
mkdirSync(dist, { recursive: true });
writeFileSync(new URL("getreel.html", dist), html);

// The artifact host wraps the page in this skeleton; preview.html adds it so
// the page can be opened straight from disk.
const skeleton =
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  "<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}" +
  "html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}" +
  "img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>";
writeFileSync(new URL("preview.html", dist), `${skeleton}\n${html}\n</body></html>`);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`artifact/dist/getreel.html: ${kb(html)}, demo reel of ${DEMO_CASES.length} (${reel.filter((d) => d.kind === "movie").length} films, ${reel.filter((d) => d.kind === "tv").length} series)`);
console.log("artifact/dist/preview.html: the same page with the host's wrapper, to open in a browser");
