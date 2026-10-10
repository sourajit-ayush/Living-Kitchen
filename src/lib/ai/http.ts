import { GenerateError, type GenerateErrorCode } from "./events";

/** JSON error body shared by the non-streaming AI routes: `{ error: { code, message } }`. */
export function errorJson(
  status: number,
  code: GenerateErrorCode,
  message: string,
  headers?: HeadersInit,
) {
  return Response.json({ error: { code, message } }, { status, headers });
}

export function rateLimited(retryAfterSec: number) {
  return errorJson(
    429,
    "rate_limited",
    "That's a lot of cooking! Give the kitchen a few minutes to cool down.",
    { "Retry-After": String(retryAfterSec) },
  );
}

const STATUS: Record<GenerateErrorCode, number> = {
  bad_request: 400,
  rate_limited: 429,
  invalid_output: 502,
  refused: 422,
  upstream: 502,
  config: 500,
};

/** Map a provider failure to a friendly JSON error (never leaks provider details). */
export function aiFailure(error: unknown, label: string) {
  const e =
    error instanceof GenerateError
      ? error
      : new GenerateError("upstream", "Something went wrong in the kitchen.");
  if (!(error instanceof GenerateError)) console.error(`[${label}] unexpected error`, error);
  else console.error(`[${label}] failed → ${e.code}: ${e.message}`);
  return errorJson(STATUS[e.code], e.code, e.message);
}
