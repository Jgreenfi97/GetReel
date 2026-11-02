import type { CSSProperties, ReactNode } from "react";

import styles from "./ornaments.module.css";

/**
 * GetReel's ornament library: Persian geometry (the eight-pointed khatam star,
 * the iwan arch, star-and-cross tilework) cast in Hollywood gold.
 *
 * All shapes are computed, so they stay crisp at any size.
 */

// ── Geometry ────────────────────────────────────────────────────────────────

/** Inner radius ratio of the khatam (two overlapping squares) star. */
const KHATAM_INNER = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export function starPath(cx: number, cy: number, outer: number, inner = outer * KHATAM_INNER, points = 8): string {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    parts.push(`${fmt(cx + radius * Math.cos(angle))} ${fmt(cy + radius * Math.sin(angle))}`);
  }
  return `M${parts.join("L")}Z`;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${fmt(cx + r)} ${fmt(cy)}A${r} ${r} 0 1 0 ${fmt(cx - r)} ${fmt(cy)}A${r} ${r} 0 1 0 ${fmt(cx + r)} ${fmt(cy)}Z`;
}

/** The khatam star with eight reel holes and a hub, cut out with even-odd fill. */
const REEL_STAR = (() => {
  let d = starPath(50, 50, 31);
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    d += circlePath(50 + 15.2 * Math.cos(a), 50 + 15.2 * Math.sin(a), 4.1);
  }
  d += circlePath(50, 50, 5.4);
  return d;
})();

const MARQUEE_BULBS = Array.from({ length: 28 }, (_, i) => {
  const a = (i * 2 * Math.PI) / 28;
  return { cx: fmt(50 + 44.7 * Math.cos(a)), cy: fmt(50 + 44.7 * Math.sin(a)) };
});

// ── Shared gradients ────────────────────────────────────────────────────────

/**
 * Gradient definitions referenced by every gold SVG on the page. Rendered once
 * in the root layout (not display:none, which breaks gradient references).
 */
export function GoldDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className={styles.defs}>
      <defs>
        <linearGradient id="gr-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a5a1f" />
          <stop offset="0.28" stopColor="#c39a49" />
          <stop offset="0.48" stopColor="#f2dc98" />
          <stop offset="0.66" stopColor="#b8903e" />
          <stop offset="1" stopColor="#86642a" />
        </linearGradient>
        <linearGradient id="gr-gold-bright" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8913f" />
          <stop offset="0.45" stopColor="#f6e6b0" />
          <stop offset="1" stopColor="#c9a24f" />
        </linearGradient>
        <radialGradient id="gr-ray-fade" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c2a05a" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#c2a05a" stopOpacity="0.16" />
          <stop offset="1" stopColor="#c2a05a" stopOpacity="0" />
        </radialGradient>
        <pattern id="pt-khatam" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d={starPath(16, 16, 16)}
            fill="none"
            stroke="#a7843f"
            strokeOpacity="0.55"
            strokeWidth="0.8"
          />
        </pattern>
      </defs>
    </svg>
  );
}

// ── Marks ───────────────────────────────────────────────────────────────────

type MarkProps = {
  size?: number | string;
  className?: string;
  title?: string;
  /** Use the brighter gold on dark backgrounds. */
  bright?: boolean;
};

/** The GetReel mark: a film reel drawn as a Persian khatam star, ringed by marquee bulbs. */
export function ReelStar({ size = 40, className, title, bright = false }: MarkProps) {
  const fill = bright ? "url(#gr-gold-bright)" : "url(#gr-gold)";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <circle cx="50" cy="50" r="48" fill="none" stroke={fill} strokeWidth="1.6" />
      <circle cx="50" cy="50" r="41.4" fill="none" stroke={fill} strokeWidth="0.9" />
      {MARQUEE_BULBS.map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.cy} r="1.05" fill={fill} />
      ))}
      <path d={REEL_STAR} fill={fill} fillRule="evenodd" />
      <circle cx="50" cy="50" r="2.4" fill={fill} />
    </svg>
  );
}

/** A small eight-pointed star, for dividers and bullets. */
export function Khatam({ size = 14, className, filled = true }: { size?: number; className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <path
        d={starPath(20, 20, 19)}
        fill={filled ? "url(#gr-gold)" : "none"}
        stroke="url(#gr-gold)"
        strokeWidth={filled ? 0 : 2}
      />
    </svg>
  );
}

/** Hairline — star — hairline. */
export function Divider({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={`${styles.divider} ${className ?? ""}`} style={style} aria-hidden="true">
      <span className={styles.dividerLine} />
      <span className={styles.dividerDiamond} />
      <Khatam size={16} />
      <span className={styles.dividerDiamond} />
      <span className={styles.dividerLine} />
    </div>
  );
}

/** A Roman numeral set inside an outlined khatam star. */
export function StarNumeral({ numeral }: { numeral: string }) {
  return (
    <span className={styles.starNumeral} aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <path d={starPath(50, 50, 47)} fill="rgba(255,255,255,0.65)" stroke="url(#gr-gold)" strokeWidth="1.6" />
        <path d={starPath(50, 50, 39)} fill="none" stroke="url(#gr-gold)" strokeWidth="0.7" />
      </svg>
      <span className={styles.starNumeralText}>{numeral}</span>
    </span>
  );
}

/** Art Deco searchlight rays — old Hollywood's premiere-night sunburst. */
export function Sunburst({ className, rays = 56 }: { className?: string; rays?: number }) {
  const paths: string[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i * 2 * Math.PI) / rays;
    const long = i % 2 === 0;
    const len = long ? 50 : 38;
    const half = (Math.PI / rays) * (long ? 0.32 : 0.22);
    const x1 = 50 + len * Math.cos(a - half);
    const y1 = 50 + len * Math.sin(a - half);
    const x2 = 50 + len * Math.cos(a + half);
    const y2 = 50 + len * Math.sin(a + half);
    paths.push(`M50 50L${fmt(x1)} ${fmt(y1)}L${fmt(x2)} ${fmt(y2)}Z`);
  }
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      <path d={paths.join("")} fill="url(#gr-ray-fade)" />
    </svg>
  );
}

/**
 * A Persian iwan arch drawn in double gold lines with a band of star-and-cross
 * tilework. The crown is an SVG that scales with width; the jambs are CSS, so
 * the arch grows with its content.
 */
export function ArchFrame({ children, className }: { children: ReactNode; className?: string }) {
  // Four-centred arch: vertical at the springing, gently pointed at the apex.
  const outer = "M8 420 L8 330 C8 196 318 134 500 14 C682 134 992 196 992 330 L992 420";
  const inner = "M40 420 L40 336 C40 214 336 156 500 52 C664 156 960 214 960 336 L960 420";
  const band = `${outer} Z ${inner} Z`;
  return (
    <div className={`${styles.arch} ${className ?? ""}`}>
      <svg className={styles.archCrown} viewBox="0 0 1000 420" aria-hidden="true" focusable="false">
        <path d={band} fill="url(#pt-khatam)" fillRule="evenodd" opacity="0.8" />
        <path d={outer} fill="none" stroke="url(#gr-gold)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <path d={inner} fill="none" stroke="url(#gr-gold)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <g transform="translate(500 30)">
          <path d={starPath(0, 0, 13)} fill="url(#gr-gold)" />
        </g>
      </svg>
      <div className={styles.archBody}>{children}</div>
    </div>
  );
}

/** A horizontal strip of star-and-cross tilework. */
export function TileBand({ className }: { className?: string }) {
  return <div className={`${styles.tileBand} ${className ?? ""}`} aria-hidden="true" />;
}
