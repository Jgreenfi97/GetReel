import Image from "next/image";

import { ReelStar } from "./ornaments";
import styles from "./Poster.module.css";

type PosterProps = {
  src: string | null;
  title: string;
  year: number | null;
  sizes: string;
  preload?: boolean;
  className?: string;
};

/**
 * A film poster in a gilt frame. Films without artwork get an engraved marble
 * plaque instead, so the grid never shows a broken image.
 */
export function Poster({ src, title, year, sizes, preload = false, className }: PosterProps) {
  return (
    <div className={`${styles.frame} ${className ?? ""}`}>
      <div className={styles.inner}>
        {src ? (
          <Image src={src} alt={`Poster for ${title}`} fill sizes={sizes} preload={preload} className={styles.image} />
        ) : (
          <div className={styles.plaque} role="img" aria-label={`${title}${year ? ` (${year})` : ""}`}>
            <ReelStar className={styles.plaqueMark} />
            <span className={`${styles.plaqueTitle} engraved`}>{title}</span>
            {year && <span className={styles.plaqueYear}>{year}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
