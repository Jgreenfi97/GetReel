import { isSearchError, SearchError } from "@/lib/errors";
import { clientKey } from "@/lib/rate-limit";
import { enforceRateLimit, runSearch } from "@/lib/search";
import { normalizeInput } from "@/lib/search-params";

/**
 * POST /api/search
 *
 * JSON API for the same search the website runs, handy for other clients
 * (a future mobile app, a browser extension) and for testing.
 *
 *   curl -X POST http://localhost:3000/api/search \
 *     -H 'content-type: application/json' \
 *     -d '{"description":"two rival magicians in victorian london"}'
 *
 * Body: { description: string, clues?: string[], excluded?: string[] }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(new SearchError("invalid_input", "Body must be JSON"));
  }

  const input = normalizeInput(typeof body === "object" && body !== null ? body : {});
  if (!input) {
    return errorResponse(new SearchError("invalid_input"));
  }

  try {
    enforceRateLimit(clientKey(request.headers));
    const result = await runSearch(input);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown): Response {
  const searchError = isSearchError(error) ? error : new SearchError("unknown");
  if (!isSearchError(error) || searchError.code === "unknown" || searchError.code === "auth") {
    console.error("[getreel] search failed:", error);
  }
  const headers: Record<string, string> = {};
  if (searchError.retryAfterSeconds) headers["Retry-After"] = String(searchError.retryAfterSeconds);
  return Response.json(
    { error: { code: searchError.code, message: searchError.publicMessage } },
    { status: searchError.status, headers },
  );
}
