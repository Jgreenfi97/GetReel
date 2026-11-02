import Link from "next/link";

import { Logo } from "@/components/Logo";
import { ArchFrame, Divider, StarNumeral, Sunburst } from "@/components/ornaments";
import { SearchBox } from "@/components/SearchBox";
import { SiteHeader } from "@/components/SiteHeader";
import { DEMO_PROMPTS } from "@/lib/demo";
import { searchHref } from "@/lib/search-params";

import styles from "./page.module.css";

const STEPS = [
  {
    numeral: "I",
    title: "Describe",
    text: "Tell us whatever you remember: a scene, a line of dialogue, a face, the decade, how it made you feel. Hazy or half-wrong is fine.",
  },
  {
    numeral: "II",
    title: "We deduce",
    text: "Our archivist weighs every clue against more than a century of cinema and ranks the likeliest films, with its reasons.",
  },
  {
    numeral: "III",
    title: "Roll the clip",
    text: "Watch the scene you were thinking of, meet the cast, find where to stream it, or rule films out and narrow it down.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader home />
      <main id="main" className={`page ${styles.home}`}>
        <section className={styles.hero} aria-labelledby="home-title">
          <ArchFrame>
            <div className={styles.heroInner}>
              <Sunburst className={styles.sunburst} />
              <h1 id="home-title" className={styles.logo}>
                <Logo size="lg" link={false} />
              </h1>
              <p className={styles.tagline}>For the film on the tip of your tongue.</p>
              <Divider className={styles.divider} />
              <p className={styles.intro}>
                Describe a scene, a line, a face, a feeling, however hazy. GetReel finds the movie and rolls the clip.
              </p>
              <div className={styles.search}>
                <SearchBox />
              </div>
              <div className={styles.tryRow}>
                <span className={styles.tryLabel}>Or try</span>
                <ul className={styles.tryList}>
                  {DEMO_PROMPTS.slice(0, 3).map((p) => (
                    <li key={p.label}>
                      <Link href={searchHref({ description: p.prompt, clues: [], excluded: [] })} className="chip">
                        {p.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ArchFrame>
        </section>

        <section className={`container ${styles.marqueeSection}`} aria-labelledby="marquee-title">
          <div className={`onyx ${styles.marquee}`}>
            <div className={styles.marqueeInner}>
              <p className={styles.marqueeKicker}>Now showing</p>
              <h2 id="marquee-title" className={styles.marqueeTitle}>
                Tonight’s half-remembered features
              </h2>
              <ul className={styles.features}>
                {DEMO_PROMPTS.map((p) => (
                  <li key={p.label}>
                    <Link href={searchHref({ description: p.prompt, clues: [], excluded: [] })} className={styles.feature}>
                      <span className={styles.featureLabel}>{p.label}</span>
                      <span className={styles.featurePrompt}>“{p.prompt}”</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="how-it-works" className={`container ${styles.how}`} aria-labelledby="how-title">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className={styles.howTitle}>
            From a hazy memory to the opening credits
          </h2>
          <Divider />
          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li key={step.numeral} className={styles.step}>
                <StarNumeral numeral={step.numeral} />
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
