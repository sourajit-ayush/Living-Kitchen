import { errorJson } from "@/lib/ai/http";
import { RecipeSchema } from "@/lib/ai/schema";
import { sniffImage } from "@/lib/imageSniff";
import { limitRequest } from "@/lib/limitRequest";
import { shareSlug } from "@/lib/share";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECIPE_BYTES = 64 * 1024;
const MAX_CARD_BYTES = 512 * 1024;

/**
 * POST multipart `recipe` (JSON) + `card` (the 1200×630 preview, drawn in the browser) →
 * `{ slug }`. Makes the recipe public at /r/[slug] (R5). The recipe is validated like any AI
 * output; the card must really be an image. Same recipe, same slug: sharing again is a no-op.
 */
export async function POST(request: Request) {
  const db = supabaseAdmin();
  if (!db) return errorJson(503, "config", "Sharing links need the site's Supabase project.");
  // Like the AI routes, the limit is off in mock mode (local development and the e2e suite).
  const limited = await limitRequest(request, "share");
  if (limited) return limited;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson(400, "bad_request", "Send the recipe as multipart form data.");
  }
  const raw = form.get("recipe");
  const card = form.get("card");
  if (typeof raw !== "string" || raw.length > MAX_RECIPE_BYTES) {
    return errorJson(400, "bad_request", "No recipe came through.");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return errorJson(400, "bad_request", "That recipe isn't valid JSON.");
  }
  const parsed = RecipeSchema.safeParse(json);
  if (!parsed.success) return errorJson(400, "bad_request", "That doesn't look like a recipe.");
  const recipe = parsed.data;
  const slug = shareSlug(recipe);

  let cardBytes: Uint8Array | null = null;
  if (card instanceof Blob && card.size > 0) {
    if (card.size > MAX_CARD_BYTES) return errorJson(413, "bad_request", "The card is too large.");
    cardBytes = new Uint8Array(await card.arrayBuffer());
    if (sniffImage(cardBytes) !== "image/jpeg") {
      return errorJson(415, "bad_request", "The card must be a JPEG.");
    }
  }

  const existing = await db.from("recipes").select("id").eq("slug", slug).maybeSingle();
  if (existing.error) return errorJson(502, "upstream", "Couldn't reach the recipe store.");
  if (!existing.data) {
    const inserted = await db.from("recipes").insert({
      slug,
      author_id: null,
      data: recipe,
      locale: recipe.locale,
      is_public: true,
      shared_at: new Date().toISOString(),
    });
    // A parallel share of the same recipe may have won the race: that's fine.
    if (inserted.error && inserted.error.code !== "23505") {
      console.error("[share] insert failed", inserted.error.message);
      return errorJson(502, "upstream", "Couldn't save the shared recipe.");
    }
  }
  if (cardBytes) {
    const up = await db.storage
      .from("share-cards")
      .upload(`${slug}.jpg`, cardBytes, { contentType: "image/jpeg", upsert: true });
    if (up.error) console.error("[share] card upload failed", up.error.message);
  }
  return Response.json({ slug }, { headers: { "Cache-Control": "no-store" } });
}
