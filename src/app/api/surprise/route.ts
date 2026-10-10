import { aiFailure, errorJson } from "@/lib/ai/http";
import { SurpriseRequestSchema } from "@/lib/ai/schema";
import { surpriseIdeas } from "@/lib/ai/surprise";
import { limitRequest } from "@/lib/limitRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

/** POST `{ ingredients, prefs, locale }` → `{ ideas: [{ title, emoji, oneLiner }] × 8 }`. */
export async function POST(request: Request) {
  const limited = await limitRequest(request, "surprise");
  if (limited) return limited;
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return errorJson(413, "bad_request", "Request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorJson(400, "bad_request", "Request body must be JSON.");
  }
  const parsed = SurpriseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(400, "bad_request", "Some of those ingredients or preferences look off.");
  }
  try {
    const ideas = await surpriseIdeas(parsed.data, request.signal);
    return Response.json({ ideas }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return aiFailure(error, "surprise");
  }
}
