import { aiFailure, errorJson } from "@/lib/ai/http";
import { scanImage, sniffImage } from "@/lib/ai/scan";
import { limitRequest } from "@/lib/limitRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** docs/04 §6: images are capped at 4 MB (the client resizes to 1024 px, usually ~200 kB). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * POST multipart `image` → `{ items: [{ name, confidence }] }`.
 * The photo is only held in memory for the model call: it is never written or logged.
 */
export async function POST(request: Request) {
  const limited = await limitRequest(request, "scan");
  if (limited) return limited;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) {
    return errorJson(413, "bad_request", "That photo is too large. Try one under 4 MB.");
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("image");
  } catch {
    return errorJson(400, "bad_request", "Send the photo as multipart form data.");
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return errorJson(400, "bad_request", "No photo came through.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return errorJson(413, "bad_request", "That photo is too large. Try one under 4 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return errorJson(415, "bad_request", "Use a JPEG, PNG or WebP photo.");

  try {
    const result = await scanImage({ bytes, mime }, request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return aiFailure(error, "scan");
  }
}
