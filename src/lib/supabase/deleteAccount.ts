import type { SupabaseClient } from "@supabase/supabase-js";

const PHOTOS = "made-photos";

/**
 * Delete everything an account holds (docs/01 §7), with the service-role client:
 * 1. its "Made it!" photos (storage objects are not removed by deleting the user),
 * 2. the recipes it authored (those keep the row with author = null otherwise),
 * 3. the user, which cascades to the profile, pantry, saved recipes and shopping list.
 * Shared links are anonymous (no author), so they are not personal data and stay up.
 */
export async function deleteAccountData(admin: SupabaseClient, userId: string): Promise<void> {
  const bucket = admin.storage.from(PHOTOS);
  for (;;) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) throw error;
    if (!data?.length) break;
    const { error: rm } = await bucket.remove(data.map((f) => `${userId}/${f.name}`));
    if (rm) throw rm;
    if (data.length < 100) break;
  }
  const recipes = await admin.from("recipes").delete().eq("author_id", userId);
  if (recipes.error) throw recipes.error;
  const user = await admin.auth.admin.deleteUser(userId);
  if (user.error) throw user.error;
}
