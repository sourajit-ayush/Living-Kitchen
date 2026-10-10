export const AI_PROVIDERS = ["anthropic", "gemini"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

type Env = Record<string, string | undefined>;

/** Which model provider serves real (non-mock) generations. Set with AI_PROVIDER in .env.local. */
export function aiProvider(env: Env = process.env): AiProvider {
  const value = env.AI_PROVIDER?.trim().toLowerCase();
  return value === "gemini" ? "gemini" : "anthropic";
}

export function providerKey(provider: AiProvider, env: Env = process.env): string | undefined {
  const key = provider === "gemini" ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY;
  return key?.trim() || undefined;
}

/** Fixture recipes when explicitly requested, or when the selected provider has no key. */
export function isMockMode(env: Env = process.env): boolean {
  return env.NEXT_PUBLIC_MOCK_AI === "1" || !providerKey(aiProvider(env), env);
}
