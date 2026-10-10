import type { GenerateErrorCode, GenerateEvent } from "@/lib/ai/events";
import type { GenerateRequestInput } from "@/lib/ai/schema";
import { authHeaders } from "@/lib/supabase/client";

export class GenerateRequestError extends Error {
  constructor(
    public code: GenerateErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Parse one SSE frame ("event: x\ndata: {...}") into an event, ignoring comments and blanks. */
export function parseSseFrame(frame: string): GenerateEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  try {
    return JSON.parse(data) as GenerateEvent;
  } catch {
    return null;
  }
}

/** POST /api/recipes/generate and feed each SSE event to `onEvent`. Resolves when the stream ends. */
export async function streamGenerate(
  body: GenerateRequestInput,
  onEvent: (event: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { code?: GenerateErrorCode; message?: string };
    } | null;
    throw new GenerateRequestError(
      payload?.error?.code ?? (res.status === 429 ? "rate_limited" : "upstream"),
      payload?.error?.message ?? `Request failed (${res.status})`,
    );
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, "\n");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const event = parseSseFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      if (event) onEvent(event);
    }
  }
  const tail = parseSseFrame(buffer);
  if (tail) onEvent(tail);
}
