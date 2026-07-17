import { generateText, stepCountIs, type ModelMessage } from "ai";
import { chatModel, assertAiConfigured } from "../lib/ai";
import { buildSystemPrompt } from "../lib/chat/system";
import { DEFAULT_SYSTEM_PROMPT } from "../lib/prompt/default";
import {
  getAvailabilityTool,
  GET_AVAILABILITY_TOOL,
} from "../lib/chat/tools/get-availability";
import { CREATE_ORDER_TOOL } from "../lib/chat/tools/create-order";
import { GET_CUSTOMER_HISTORY_TOOL } from "../lib/chat/tools/get-customer-history";
import { buildCreateOrderMock, type MockOutcome } from "./mocks/create-order-mock";
import {
  buildCustomerHistoryMock,
  type CustomerLookup,
} from "./mocks/customer-history-mock";
import type { CreateOrderInput } from "../lib/chat/tools/create-order";

type CapturedToolCall = { toolName: string; input: unknown };

export default class BulldogAgentProvider {
  id() {
    return "bulldog-agent";
  }

  async callApi(prompt: string, context?: any) {
    assertAiConfigured();

    // Espía LOCAL por test (no global — promptfoo corre tests en paralelo)
    const orders: CreateOrderInput[] = [];
    const customerLookups: CustomerLookup[] = [];
    const outcome = (context?.vars?.orderOutcome ?? "success") as MockOutcome;

    const tools = {
      [GET_AVAILABILITY_TOOL]: getAvailabilityTool,               // REAL (solo lee)
      [GET_CUSTOMER_HISTORY_TOOL]: buildCustomerHistoryMock(customerLookups), // MOCK (fixtures)
      [CREATE_ORDER_TOOL]: buildCreateOrderMock(outcome, orders), // MOCK
    };
    const system = buildSystemPrompt(DEFAULT_SYSTEM_PROMPT); // síncrona, sin await

    const messages: ModelMessage[] = [];
    const toolCalls: CapturedToolCall[] = [];

    // Un "turno del agente": genera respuesta (con hasta 5 pasos de tools,
    // igual que el route) y acumula todo en el historial.
    const ask = async () => {
      const r = await generateText({
        model: chatModel,
        system,
        messages,
        tools,
        stopWhen: stepCountIs(5),
        // Respuestas de chat cortas; sin esto OpenRouter reserva el máximo del
        // modelo (64k) por request y rechaza la llamada si el saldo no alcanza.
        maxOutputTokens: 1024,
      });
      messages.push(...r.response.messages); // respuesta + tool calls/results
      toolCalls.push(
        ...r.steps.flatMap((s) =>
          s.toolCalls.map((c) => ({ toolName: c.toolName, input: c.input }))
        )
      );
      return r.text;
    };

    let lastReply = "";
    const history = parseSimulatedUserHistory(prompt);
    // OJO: en promptfoo un var que es ARRAY se expande en N casos de prueba
    // (uno por elemento); por eso el guion viaja como objeto { turns: [...] }.
    const userTurns: unknown = (context?.vars?.conversation as any)?.turns;

    if (history) {
      // Modo 3: cliente simulado — promptfoo manda el historial completo
      // como JSON en cada llamada; solo generamos la siguiente respuesta.
      messages.push(...history);
      lastReply = await ask();
    } else if (Array.isArray(userTurns) && userTurns.length > 0) {
      // Modo 2: guion — la plática se reproduce turno a turno contra el
      // agente real (sus respuestas alimentan el siguiente turno).
      for (const turn of userTurns) {
        messages.push({ role: "user", content: String(turn) });
        lastReply = await ask();
      }
    } else {
      // Modo 1: mensaje suelto (smoke tests)
      messages.push({ role: "user", content: prompt });
      lastReply = await ask();
    }

    return {
      // El `output` que califican los llm-rubric es la CONVERSACIÓN COMPLETA
      // (turnos de cliente + asistente), no solo la última respuesta. Así el
      // juez evalúa el comportamiento a lo largo de toda la plática (p. ej. que
      // en ALGÚN momento confirmó la reserva), no un cierre suelto. Los asserts
      // deterministas siguen leyendo `metadata` (tools, payloads).
      output: renderConversation(messages),
      metadata: {
        toolCalls,
        orders,
        customerLookups,
        lastReply, // por si algún assert necesita solo la última respuesta
        // Solo para depurar en el visor; content puede ser array (tool parts)
        transcript: messages.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
      },
    };
  }
}

/**
 * Renderiza el historial como texto legible para el Juez LLM: solo los turnos de
 * cliente y las respuestas de texto del asistente (las tool-calls/results se
 * omiten — no son texto de cara al visitante). Formato "Customer:" / "Assistant:".
 */
function renderConversation(messages: ModelMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      const text = typeof m.content === "string" ? m.content : "";
      if (text.trim()) lines.push(`Customer: ${text}`);
    } else if (m.role === "assistant") {
      const text = Array.isArray(m.content)
        ? m.content
            .filter((p): p is { type: "text"; text: string } => (p as any)?.type === "text")
            .map((p) => p.text)
            .join("")
        : typeof m.content === "string"
          ? m.content
          : "";
      if (text.trim()) lines.push(`Assistant: ${text}`);
    }
  }
  return lines.join("\n\n");
}

/** Detecta el formato del simulated-user: un JSON array [{role, content}, ...] */
function parseSimulatedUserHistory(prompt: string): ModelMessage[] | null {
  try {
    const parsed = JSON.parse(prompt);
    if (!Array.isArray(parsed)) return null;
    const turns = parsed.filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    );
    return turns.length > 0 ? (turns as ModelMessage[]) : null;
  } catch {
    return null;
  }
}

