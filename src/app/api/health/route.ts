import { connection } from "next/server";

import { getConfig, getFeatures } from "@/lib/config";

/**
 * GET /api/health
 *
 * Shows which services are switched on (never the keys themselves). Useful
 * after deploying: open /api/health to confirm your environment variables
 * were picked up.
 */
export async function GET() {
  await connection(); // evaluate per request, not at build time
  const features = getFeatures();
  const config = getConfig();
  return Response.json({
    status: "ok",
    mode: features.claude ? "live" : "demo",
    services: {
      claude: features.claude ? { enabled: true, model: config.anthropicModel, effort: config.anthropicEffort } : { enabled: false },
      tmdb: { enabled: features.tmdb, region: config.watchRegion },
      youtube: { enabled: features.youtube },
    },
  });
}
