import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateEvent } from "@/lib/ai/events";
import { FIXTURES } from "@/lib/ai/mock";
import { GenerateRequestSchema } from "@/lib/ai/schema";

vi.mock("server-only", () => ({}));

const generateContentStream = vi.fn();

vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number;
    constructor({ message, status }: { message: string; status: number }) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    GoogleGenAI: class {
      models = { generateContentStream };
    },
    ThinkingLevel: { LOW: "LOW" },
    FinishReason: {
      STOP: "STOP",
      MAX_TOKENS: "MAX_TOKENS",
      SAFETY: "SAFETY",
      PROHIBITED_CONTENT: "PROHIBITED_CONTENT",
      BLOCKLIST: "BLOCKLIST",
      SPII: "SPII",
      RECITATION: "RECITATION",
    },
  };
});

const { geminiGenerate } = await import("@/lib/ai/gemini");
const { ApiError } = await import("@google/genai");

const req = GenerateRequestSchema.parse({
  ingredients: [{ name: "spinach" }, { name: "paneer" }],
  prefs: {
    diet: "vegetarian",
    cuisine: "any",
    maxMinutes: 30,
    spice: 3,
    difficulty: "any",
    cookware: [],
    servings: 2,
    meal: "dinner",
  },
  locale: "en",
});

/** Fake streamed response: the JSON text split into a few chunks. */
function streamOf(text: string, finishReason = "STOP") {
  const size = Math.ceil(text.length / 4);
  const chunks = Array.from({ length: Math.ceil(text.length / size) }, (_, i) => ({
    text: text.slice(i * size, (i + 1) * size),
    candidates: [
      { finishReason: i === Math.ceil(text.length / size) - 1 ? finishReason : undefined },
    ],
  }));
  return (async function* () {
    yield* chunks;
  })();
}

async function collect(gen: AsyncGenerator<GenerateEvent>) {
  const events: GenerateEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const VALID = JSON.stringify({ recipes: FIXTURES });

beforeEach(() => generateContentStream.mockReset());

describe("geminiGenerate", () => {
  it("streams progress, then yields 3 validated recipes", async () => {
    generateContentStream.mockResolvedValueOnce(streamOf(VALID));
    const events = await collect(geminiGenerate(req));

    const progress = events.filter((e) => e.type === "progress").map((e) => e.value);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(events.filter((e) => e.type === "recipe")).toHaveLength(3);

    const call = generateContentStream.mock.calls[0][0];
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema).toBeTypeOf("object");
    expect(call.config.systemInstruction).toContain("Nani");
    expect(call.contents[0].parts[0].text).toContain("spinach");
  });

  it("retries once with the validation errors, append-only", async () => {
    generateContentStream
      .mockResolvedValueOnce(streamOf(JSON.stringify({ recipes: FIXTURES.slice(0, 2) })))
      .mockResolvedValueOnce(streamOf(VALID));
    const events = await collect(geminiGenerate(req));

    expect(events.filter((e) => e.type === "recipe")).toHaveLength(3);
    const retry = generateContentStream.mock.calls[1][0].contents;
    expect(retry.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    expect(retry[2].parts[0].text).toContain("failed validation");
  });

  it("gives up after two invalid responses", async () => {
    generateContentStream.mockResolvedValue(streamOf("{ not json"));
    await expect(collect(geminiGenerate(req))).rejects.toMatchObject({ code: "invalid_output" });
    expect(generateContentStream).toHaveBeenCalledTimes(2);
  });

  it("retries a 503 overload and succeeds", async () => {
    generateContentStream
      .mockRejectedValueOnce(new ApiError({ message: "high demand", status: 503 }))
      .mockResolvedValueOnce(streamOf(VALID));
    const events = await collect(geminiGenerate(req));
    expect(events.filter((e) => e.type === "recipe")).toHaveLength(3);
    expect(generateContentStream).toHaveBeenCalledTimes(2);
  });

  it("retries when the stream breaks off mid-way (SDK parse error)", async () => {
    const broken = (async function* () {
      yield { text: '{"recipes":[', candidates: [{}] };
      throw new Error("Incomplete JSON segment at the end");
    })();
    generateContentStream.mockResolvedValueOnce(broken).mockResolvedValueOnce(streamOf(VALID));
    const events = await collect(geminiGenerate(req));
    expect(events.filter((e) => e.type === "recipe")).toHaveLength(3);
  });

  it("falls back to the second model, retries the main one, then reports upstream", async () => {
    const overloaded = () => new ApiError({ message: "high demand", status: 503 });
    generateContentStream
      .mockRejectedValueOnce(overloaded())
      .mockRejectedValueOnce(overloaded())
      .mockRejectedValueOnce(overloaded())
      .mockRejectedValueOnce(overloaded());
    await expect(collect(geminiGenerate(req))).rejects.toMatchObject({ code: "upstream" });
    const models = generateContentStream.mock.calls.map((c) => c[0].model);
    expect(models).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
    ]);
  });

  it("maps an exhausted free quota (429) to rate_limited", async () => {
    generateContentStream.mockRejectedValueOnce(new ApiError({ message: "quota", status: 429 }));
    await expect(collect(geminiGenerate(req))).rejects.toMatchObject({ code: "rate_limited" });
    expect(generateContentStream).toHaveBeenCalledTimes(1); // quota errors are not retried
  });

  it("maps a bad key to config", async () => {
    generateContentStream.mockRejectedValueOnce(new ApiError({ message: "bad key", status: 400 }));
    await expect(collect(geminiGenerate(req))).rejects.toMatchObject({ code: "config" });
  });

  it("treats a safety stop as refused", async () => {
    generateContentStream.mockResolvedValueOnce(streamOf("{}", "SAFETY"));
    await expect(collect(geminiGenerate(req))).rejects.toMatchObject({ code: "refused" });
  });
});
