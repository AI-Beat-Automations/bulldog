import { streamText } from "ai";

import { assertAiConfigured, chatModel } from "@/lib/ai";
import {
  ConversationNotFoundError,
  loadHistory,
  resolveConversation,
  saveMessage,
  type ConversationSource,
} from "@/lib/chat/persistence";
import { getActiveSystemPrompt } from "@/lib/prompt/repository";
import { corsHeaders, isAllowedOrigin } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Cliente de DB (pg/Neon) no corre en edge → runtime Node. Techo 30s al stream.
export const maxDuration = 30;

/** Preflight CORS para navegadores cross-origin (el embed.js cruzado). */
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

function extractUserText(body: Record<string, unknown>): string | null {
  if (typeof body.text === "string") return body.text;
  const message = body.message;
  if (message && typeof message === "object") {
    const parts = (message as Record<string, unknown>).parts;
    if (Array.isArray(parts)) {
      return parts
        .filter(
          (p): p is { type: string; text: string } =>
            !!p &&
            typeof p === "object" &&
            (p as Record<string, unknown>).type === "text" &&
            typeof (p as Record<string, unknown>).text === "string"
        )
        .map((p) => p.text)
        .join("");
    }
  }
  return null;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  // 1) Origin allowlist.
  if (!isAllowedOrigin(origin)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }
  const headers = corsHeaders(origin);

  // 2) Rate limit por IP (endpoint público que cuesta tokens).
  const { success } = await rateLimit(clientIp(request));
  if (!success) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers }
    );
  }

  // 3) Body + validación manual (sin zod, como el repo).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "expected object" }, { status: 400, headers });
  }
  const obj = body as Record<string, unknown>;

  const conversationId = obj.conversationId;
  if (conversationId !== undefined && typeof conversationId !== "string") {
    return Response.json(
      { error: "conversationId must be a string" },
      { status: 400, headers }
    );
  }

  // Origen de la conversación. NOTA: lo provee el cliente (falsificable); se usa
  // solo al CREAR una conversación nueva. Ver ADR-0002 (riesgo aceptado v1).
  const rawSource = obj.source;
  if (
    rawSource !== undefined &&
    rawSource !== "widget" &&
    rawSource !== "playground"
  ) {
    return Response.json(
      { error: "source must be 'widget' or 'playground'" },
      { status: 400, headers }
    );
  }
  const source = rawSource as ConversationSource | undefined;

  const userText = extractUserText(obj);
  if (typeof userText !== "string" || userText.trim().length === 0) {
    return Response.json(
      { error: "message text is required" },
      { status: 400, headers }
    );
  }
  const content = userText.trim();

  // 4) Resolver conversación (id desconocido → 404, nunca upsert).
  let id: string;
  try {
    id = (await resolveConversation(conversationId, source)).id;
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404, headers }
      );
    }
    throw error;
  }

  assertAiConfigured();

  // 5) Persistir user antes del stream; reconstruir contexto desde la DB.
  await saveMessage({ conversationId: id, role: "user", content });
  const history = await loadHistory(id);

  // Lee la versión activa en cada request (sin cache): los cambios de prompt
  // desde el admin aplican al instante.
  const systemPrompt = await getActiveSystemPrompt();

  const result = streamText({
    model: chatModel,
    system: systemPrompt,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    abortSignal: request.signal,
    onFinish: async ({ text }) => {
      const assistantText = text.trim();
      if (assistantText.length === 0) return;
      try {
        await saveMessage({
          conversationId: id,
          role: "assistant",
          content: assistantText,
        });
      } catch (error) {
        console.error(
          "[chat] no se pudo persistir assistant",
          JSON.stringify({ conversationId: id, error: String(error) })
        );
      }
    },
  });

  // Sobrevive desconexión del cliente (corre en background, sin await).
  result.consumeStream();

  // Stream UI-message + CORS + X-Conversation-Id (expuesto vía CORS en lib/cors).
  return result.toUIMessageStreamResponse({
    headers: { ...headers, "X-Conversation-Id": id },
  });
}
