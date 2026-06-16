import { jsonSchema, tool } from "ai";

/**
 * Tool del Asistente para consultar Disponibilidad de citas contra un webhook de
 * n8n. Solo LEE (no agenda — ver CONTEXT.md). El `date` ISO lo produce el modelo
 * siguiendo las reglas inyectadas en el system; el servidor lo manda literal con
 * sufijo `Z`, que es el contrato que espera n8n.
 *
 * Forma real verificada del endpoint (prod): respuesta `{ "data": { "08-12": 4,
 * "12-17": 4 } }`. Hoy es un mock estático (devuelve lo mismo para cualquier
 * fecha), por eso el parseo es defensivo: el backend real podría mandar `0`,
 * omitir franjas o venir vacío.
 */

/** Nombre con el que el modelo ve la tool; compartido con la inyección al system. */
export const CHECK_AVAILABILITY_TOOL = "check_availability";

// URL de PRODUCCIÓN por default. Nunca apuntar a /webhook-test/... (en n8n esa URL
// solo responde una vez mientras el editor está "escuchando"). Override por env.
const WEBHOOK_URL =
  process.env.AVAILABILITY_WEBHOOK_URL ||
  "https://jumpers-n8n.djltpi.easypanel.host/webhook/availability-text";

const FETCH_TIMEOUT_MS = 10_000;

// Traducción de franjas conocidas (hora del negocio, Las Vegas). Las franjas las
// tratamos como dinámicas: una llave desconocida se pasa con su id crudo como
// label, así n8n puede agregar franjas (p. ej. "17-20") sin romper la tool.
const FRANJA_LABELS: Record<string, string> = {
  "08-12": "mañana (8:00–12:00)",
  "8-12": "mañana (8:00–12:00)",
  "12-17": "tarde (12:00–17:00)",
};

export interface Franja {
  id: string;
  label: string;
  cupos: number;
}

type AvailabilityResult =
  | { ok: true; zona: string; franjas: Franja[] }
  | { ok: false; reason: "unavailable" | "bad_response" };

/** Desempaca `{ data: {...} }` → franjas normalizadas. Defensivo ante formas raras. */
function normalize(payload: unknown): AvailabilityResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "bad_response" };
  }
  const data = (payload as Record<string, unknown>).data;
  // `data` ausente o no-objeto = respuesta ininteligible → no afirmamos nada.
  // Un objeto vacío `{}` SÍ es válido: significa "sin disponibilidad" (franjas: []).
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "bad_response" };
  }
  const franjas: Franja[] = [];
  for (const [id, raw] of Object.entries(data as Record<string, unknown>)) {
    const cupos = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(cupos) || cupos < 0) continue; // ignora valores basura
    franjas.push({
      id,
      label: FRANJA_LABELS[id] ?? id,
      cupos: Math.trunc(cupos),
    });
  }
  return { ok: true, zona: "America/Los_Angeles", franjas };
}

export const checkAvailabilityTool = tool({
  description:
    'Consulta los cupos de citas disponibles para un día. Úsala cuando el ' +
    "visitante pregunte por disponibilidad o quiera agendar. El formato de " +
    '"date" y las reglas para resolverlo están en el system (arriba). Solo ' +
    "consulta disponibilidad; no agenda nada.",
  inputSchema: jsonSchema<{ date: string }>({
    type: "object",
    additionalProperties: false,
    properties: {
      date: {
        type: "string",
        description:
          "Fecha/hora de la cita en ISO 8601 con sufijo Z (ej. " +
          "2026-06-20T00:00:00.000Z), resuelta según las reglas del system.",
      },
    },
    required: ["date"],
  }),
  execute: async ({ date }): Promise<AvailabilityResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, reason: "unavailable" };
      return normalize(await res.json());
    } catch {
      // Timeout, red caída o JSON inválido → sentinela; el asistente nunca inventa.
      return { ok: false, reason: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  },
});
