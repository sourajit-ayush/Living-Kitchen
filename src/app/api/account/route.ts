import { errorJson } from "@/lib/ai/http";
import { userFromToken } from "@/lib/limitRequest";
import { bearerToken } from "@/lib/limits";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteAccountData } from "@/lib/supabase/deleteAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE (signed in, `Authorization: Bearer <access token>`): delete the account and everything
 * it holds (Settings → "Delete my data"). The token must verify; nobody else can delete it.
 */
export async function DELETE(request: Request) {
  const db = supabaseAdmin();
  if (!db) return errorJson(503, "config", "Accounts aren't set up on this site.");
  const token = bearerToken(request.headers);
  const userId = token ? await userFromToken(token, { fresh: true }).catch(() => null) : null;
  if (!userId) return errorJson(401, "bad_request", "Please sign in again to delete your account.");
  try {
    await deleteAccountData(db, userId);
  } catch (error) {
    console.error("[account] delete failed", (error as Error).message);
    return errorJson(502, "upstream", "Couldn't delete your account just now. Please try again.");
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
