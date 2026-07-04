import {
  stepCountIs,
  streamText,
  type JSONValue,
  type ModelMessage,
} from "ai";

import { assertAiConfigured, chatModel } from "@/lib/ai";
import {
  ConversationNotFoundError,
  loadModelContext,
  resolveConversation,
  saveMessage,
  saveToolMessage,
  type ConversationSource,
} from "@/lib/chat/persistence";
import { buildSystemPrompt } from "@/lib/chat/system";
import {
  GET_AVAILABILITY_TOOL,
  getAvailabilityTool,
} from "@/lib/chat/tools/get-availability";
import {
  CREATE_ORDER_TOOL,
  createOrderTool,
} from "@/lib/chat/tools/create-order";
import { getActiveSystemPrompt } from "@/lib/prompt/repository";
import { corsHeaders, isAllowedOrigin } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Cliente de DB (pg/Neon) no corre en edge → runtime Node. Techo 60s al stream:
// hasta 5 steps con tools de 10s de timeout pueden superar 30s.
export const maxDuration = 60;

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

  // 5) Persistir user antes del stream; reconstruir contexto desde la DB:
  // últimas 25 filas contando todo, con los pares del Registro de Tool
  // re-inyectados como mensajes de tool reales del protocolo. Ver ADR-0006.
  await saveMessage({ conversationId: id, role: "user", content });
  const context = await loadModelContext(id);

  // Índice de resultados por toolCallId para emparejar con su llamada.
  const resultsById = new Map<string, Record<string, unknown>>();
  for (const item of context) {
    if (item.role === "tool_result" && item.payload?.toolCallId) {
      resultsById.set(String(item.payload.toolCallId), item.payload);
    }
  }
  const messages: ModelMessage[] = [];
  for (const item of context) {
    if (item.role === "user" || item.role === "assistant") {
      messages.push({ role: item.role, content: item.content });
      continue;
    }
    // Solo pares completos: un tool_call sin result en la ventana, un
    // tool_result cuyo call quedó fuera de ella o un payload malformado se
    // descartan — los providers exigen pares completos.
    if (item.role !== "tool_call" || !item.payload?.toolCallId) continue;
    const toolCallId = String(item.payload.toolCallId);
    const toolResult = resultsById.get(toolCallId);
    if (!toolResult) continue;
    const toolName = String(item.payload.toolName);
    messages.push({
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId, toolName, input: item.payload.input },
      ],
    });
    messages.push({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName,
          output: { type: "json", value: toolResult.output as JSONValue },
        },
      ],
    });
  }

  // Lee la versión activa en cada request (sin cache): los cambios de prompt
  // desde el admin aplican al instante. buildSystemPrompt antepone la mecánica
  // code-owned (fecha/hora actual + tool de disponibilidad + reglas de fecha).
  const activePrompt = await getActiveSystemPrompt();
  const system = buildSystemPrompt(activePrompt);

  const result = streamText({
    model: chatModel,
    system,
    messages,
    // Multi-step: sin stopWhen el modelo llama la tool y NO redacta la respuesta.
    tools: {
      [GET_AVAILABILITY_TOOL]: getAvailabilityTool,
      [CREATE_ORDER_TOOL]: createOrderTool,
    },
    stopWhen: stepCountIs(5),
    abortSignal: request.signal,
    // Registro de Tool: persiste cada llamada y su resultado al cerrar el step.
    // El SDK hace await del callback antes del siguiente step y de onFinish →
    // las filas de tool siempre preceden a la fila assistant. Ver ADR-0005.
    onStepFinish: async ({ toolCalls, toolResults }) => {
      for (const call of toolCalls) {
        try {
          await saveToolMessage({
            conversationId: id,
            role: "tool_call",
            content: call.toolName,
            payload: {
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              input: call.input,
            },
          });
          const result = toolResults.find(
            (r) => r.toolCallId === call.toolCallId
          );
          // Sin resultado (p. ej. input inválido) la fila tool_call queda
          // huérfana — legal; las vistas la toleran.
          if (result) {
            await saveToolMessage({
              conversationId: id,
              role: "tool_result",
              content: call.toolName,
              payload: {
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output: result.output,
              },
            });
          }
        } catch (error) {
          console.error(
            "[chat] no se pudo persistir registro de tool",
            JSON.stringify({ conversationId: id, error: String(error) })
          );
        }
      }
    },
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
