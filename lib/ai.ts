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

// Fuente de verdad del system prompt: la tabla `prompt_versions` (ver
// lib/prompt/repository.ts). Esta constante es solo el fallback cuando no hay
// ninguna versión activa. La env CHAT_SYSTEM_PROMPT quedó jubilada — ver
// docs/adr/0001-system-prompt-versionado-en-db.md.
export const DEFAULT_SYSTEM_PROMPT =
  "Eres un asistente de IA útil, claro y conciso. Responde en el mismo idioma del usuario.";

export function assertAiConfigured(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY no está configurada");
  }
}
