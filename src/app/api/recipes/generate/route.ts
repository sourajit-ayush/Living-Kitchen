import { getCachedRecipes, modelLabel, putCachedRecipes, replayRecipes } from "@/lib/ai/cache";
import { generateCacheKey } from "@/lib/ai/cacheKey";
import { GenerateError, type GenerateEvent } from "@/lib/ai/events";
import { generateRecipes } from "@/lib/ai/generate";
import { DRINK_LOADING_LINES, LOADING_LINES } from "@/lib/ai/loadingLines";
import { isMockMode } from "@/lib/ai/provider";
import { GenerateRequestSchema, isSingleRecipe, type Recipe } from "@/lib/ai/schema";
import { limitRequest } from "@/lib/limitRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;

function json(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, "bad_request", "Request is too large.");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, "bad_request", "Request body must be JSON.");
  }
  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success)
    return json(400, "bad_request", "Some of those ingredients or preferences look off.");
  const req = parsed.data;

  // The same request within 24 h replays the stored answer: no model call, and it doesn't count
  // against the hourly limit (docs/04 §4). Mock mode never touches the cache.
  const cacheKey = isMockMode() ? null : generateCacheKey(req, modelLabel());
  const cached = cacheKey ? await getCachedRecipes(cacheKey) : null;
  if (!cached) {
    const limited = await limitRequest(request, "generate");
    if (limited) return limited;
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: GenerateEvent) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      };

      // Synthetic progress so the pot keeps bubbling while the model thinks; real progress
      // (streamed characters) takes over when it is ahead. Never reaches 1 before "done".
      const lines = (req.category === "drink" ? DRINK_LOADING_LINES : LOADING_LINES)[req.locale];
      const started = Date.now();
      let progress = 0;
      let tick = 0;
      const heartbeat = setInterval(() => {
        const synthetic = 0.85 * (1 - Math.exp(-(Date.now() - started) / 7000));
        progress = Math.max(progress, synthetic);
        send({ type: "progress", value: progress, line: lines[tick++ % lines.length] });
      }, 1200);
      send({ type: "progress", value: 0, line: lines[0] });

      const answer: Recipe[] = [];
      try {
        const source = cached
          ? replayRecipes(cached, abort.signal)
          : generateRecipes(req, abort.signal);
        for await (const event of source) {
          if (event.type === "recipe") answer[event.index] = event.recipe;
          if (event.type === "progress") {
            if (event.value <= progress) continue;
            progress = event.value;
          }
          send(event);
        }
        send({ type: "progress", value: 1 });
        send({ type: "done" });
        const expected = isSingleRecipe(req.mode) ? 1 : 3;
        if (
          cacheKey &&
          !cached &&
          !abort.signal.aborted &&
          answer.filter(Boolean).length === expected
        ) {
          await putCachedRecipes(cacheKey, answer);
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          const e =
            error instanceof GenerateError
              ? error
              : new GenerateError("upstream", "Something went wrong in the kitchen.");
          if (!(error instanceof GenerateError))
            console.error("[generate] unexpected error", error);
          console.error(`[generate] failed → ${e.code}: ${e.message}`);
          send({ type: "error", code: e.code, message: e.message });
        }
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by a client disconnect
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Cache": cached ? "HIT" : "MISS",
    },
  });
}
