/**
 * English display names for TMDB's language and country codes, so an
 * international title can say "Korean · South Korea" instead of "ko · KR".
 */

const languages = new Intl.DisplayNames(["en"], { type: "language" });
const regions = new Intl.DisplayNames(["en"], { type: "region" });

/** TMDB uses a few codes that aren't standard ISO 639-1. */
const TMDB_LANGUAGE_QUIRKS: Record<string, string | null> = {
  cn: "Cantonese",
  xx: null, // "no language"
};

export function languageName(code: string | null | undefined): string | null {
  if (!code) return null;
  const lower = code.toLowerCase();
  if (Object.hasOwn(TMDB_LANGUAGE_QUIRKS, lower)) return TMDB_LANGUAGE_QUIRKS[lower];
  try {
    const name = languages.of(lower);
    return name && name.toLowerCase() !== lower ? name : null;
  } catch {
    return null;
  }
}

/** TMDB codes that aren't valid BCP 47 language tags, mapped to ones that are. */
const BCP47_FIXES: Record<string, string | null> = { cn: "yue", xx: null };

/** A value safe for an HTML `lang` attribute, or null. */
export function langAttribute(code: string | null | undefined): string | null {
  if (!code) return null;
  const lower = code.toLowerCase();
  const fixed = Object.hasOwn(BCP47_FIXES, lower) ? BCP47_FIXES[lower] : lower;
  return fixed && /^[a-z]{2,3}$/.test(fixed) ? fixed : null;
}

/** The language name only when it isn't English (the default worth mentioning). */
export function foreignLanguageName(code: string | null | undefined): string | null {
  return code && code.toLowerCase() !== "en" ? languageName(code) : null;
}

export function countryNames(codes: readonly string[]): string[] {
  const names: string[] = [];
  for (const code of codes) {
    try {
      const name = regions.of(code.toUpperCase());
      if (name && name !== code.toUpperCase() && !names.includes(name)) names.push(name);
    } catch {
      // Ignore malformed codes.
    }
  }
  return names;
}
