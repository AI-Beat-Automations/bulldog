import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.warn("[ai] OPENROUTER_API_KEY no configurada; las llamadas fallarán.");
}

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

const openrouter = createOpenRouter({ apiKey: apiKey ?? "or-unset" });

export const chatModel = openrouter(
  process.env.OPENROUTER_MODEL || DEFAULT_MODEL
);

// System prompt configurable sin redeploy de código. Default genérico.
export const SYSTEM_PROMPT =
  process.env.CHAT_SYSTEM_PROMPT ??
  "Eres un asistente de IA útil, claro y conciso. Responde en el mismo idioma del usuario.";

export function assertAiConfigured(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY no está configurada");
  }
}
