import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompt/default";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.warn("[ai] OPENROUTER_API_KEY no configurada; las llamadas fallarán.");
}

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

const openrouter = createOpenRouter({ apiKey: apiKey ?? "or-unset" });

export const chatModel = openrouter(
  process.env.OPENROUTER_MODEL || DEFAULT_MODEL
);

export function assertAiConfigured(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY no está configurada");
  }
}
