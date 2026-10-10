import { resizeForScan } from "@/lib/resizeImage";
import { getSupabase } from "./client";

const BUCKET = "made-photos";

/**
 * "Made it!" photo (R2): shrunk on the device (1280 px JPEG, metadata dropped) and stored in the
 * user's own folder of a private bucket. Returns the storage path kept on the book entry.
 */
export async function uploadMadePhoto(file: Blob, entryKey: string): Promise<string> {
  const sb = await getSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  const small = await resizeForScan(file, 1280);
  const path = `${data.user.id}/${entryKey}-${Date.now()}.jpg`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, small, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

/** A short-lived URL for showing a private photo. */
export async function photoUrl(path: string): Promise<string | null> {
  const sb = await getSupabase();
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function deletePhoto(path: string): Promise<void> {
  const sb = await getSupabase();
  await sb.storage.from(BUCKET).remove([path]);
}
