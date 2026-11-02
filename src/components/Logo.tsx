import Link from "next/link";

import { ReelStar } from "./ornaments";
import styles from "./Logo.module.css";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  /** Gold tuned for dark backgrounds. */
  onDark?: boolean;
  /** Render as a link to the home page. */
  link?: boolean;
  className?: string;
};

/**
 * The GetReel lockup. Cinzel sets lowercase as small capitals, so "GetReel"
 * reads as an inscription: G·ET·R·EEL.
 */
export function Logo({ size = "md", onDark = false, link = true, className }: LogoProps) {
  const content = (
    <>
      <ReelStar className={styles.mark} bright={onDark} />
      <span className={`${styles.word} foil`}>GetReel</span>
    </>
  );
  const cls = `${styles.logo} ${styles[size]} ${onDark ? styles.onDark : ""} ${className ?? ""}`;
  return link ? (
    <Link href="/" className={cls} aria-label="GetReel home">
      {content}
    </Link>
  ) : (
    <span className={cls}>{content}</span>
  );
}
