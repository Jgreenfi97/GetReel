import type { MetadataRoute } from "next";

/**
 * Every search page triggers a paid AI call, so crawlers are kept away from
 * /search and the API. The home and about pages stay indexable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/search", "/api/"] }],
  };
}
