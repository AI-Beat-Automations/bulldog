import { jsonSchema, tool } from "ai";

import { BUSINESS_TIMEZONE } from "@/lib/chat/timezone";

/**
 * Tool del Asistente para consultar Disponibilidad de citas contra un webhook de
 * n8n. Solo LEE (no agenda — ver CONTEXT.md). El modelo produce un rango
 * `dateStart`/`dateEnd` en `YYYY-MM-DD` siguiendo las reglas del system; el
 * servidor lo acota (clamps) antes del fetch, por eso el retorno incluye el
 * rango efectivo (puede diferir del input del modelo).
 *
 * Forma real verificada del endpoint (prod): respuesta
 * `{ "data": { "2026-07-03": { "morning": 0, "afternoon": 2 }, ... } }`.
 * El parseo es defensivo: el backend podría mandar `0`, omitir franjas,
 * agregar franjas nuevas o venir vacío.
 */

/** Nombre con el que el modelo ve la tool; compartido con la inyección al system. */
export const GET_AVAILABILITY_TOOL = "get_availability";

// URL de PRODUCCIÓN por default. Nunca apuntar a /webhook-test/... (en n8n esa URL
// solo responde una vez mientras el editor está "escuchando"). Override por env.
const WEBHOOK_URL =
  process.env.AVAILABILITY_WEBHOOK_URL ||
  "https://lori-n8n.glsjow.easypanel.host/webhook/text-availability";

const FETCH_TIMEOUT_MS = 10_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Tope del rango consultable en una sola llamada (inclusive).
const MAX_RANGE_DAYS = 31;

// Traducción de franjas conocidas (hora del negocio, Las Vegas). Las franjas las
// tratamos como dinámicas: una llave desconocida se pasa con su id crudo como
// label, así n8n puede agregar franjas (p. ej. "evening") sin romper la tool.
const FRANJA_LABELS: Record<string, string> = {
  morning: "mañana (8:00–12:00)",
  afternoon: "tarde (12:00–17:00)",
};

export interface Franja {
  id: string;
  label: string;
  cupos: number;
}

type GetAvailabilityResult =
  | {
      ok: true;
      zona: string;
      range: { dateStart: string; dateEnd: string };
      days: Array<{ date: string; franjas: Franja[] }>;
    }
  | { ok: false; reason: "unavailable" | "bad_response" | "bad_input" };

/**
 * Desempaca `{ data: { "YYYY-MM-DD": { franja: cupos } } }` → días con franjas
 * normalizadas. Defensivo ante formas raras.
 */
function normalize(
  payload: unknown,
  range: { dateStart: string; dateEnd: string }
): GetAvailabilityResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "bad_response" };
  }
  const data = (payload as Record<string, unknown>).data;
  // `data` ausente o no-objeto = respuesta ininteligible → no afirmamos nada.
  // Un objeto vacío `{}` SÍ es válido: significa "sin disponibilidad" (days: []).
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "bad_response" };
  }
  const days: Array<{ date: string; franjas: Franja[] }> = [];
  for (const [date, slots] of Object.entries(data as Record<string, unknown>)) {
    if (!slots || typeof slots !== "object" || Array.isArray(slots)) continue;
    const franjas: Franja[] = [];
    for (const [id, raw] of Object.entries(slots as Record<string, unknown>)) {
      const cupos = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(cupos) || cupos < 0) continue; // ignora valores basura
      franjas.push({
        id,
        label: FRANJA_LABELS[id] ?? id,
        cupos: Math.trunc(cupos),
      });
    }
    days.push({ date, franjas });
  }
  return { ok: true, zona: BUSINESS_TIMEZONE, range, days };
}

export const getAvailabilityTool = tool({
  description:
    "Consulta los cupos de citas disponibles por día y franja en un rango de " +
    "fechas. Úsala cuando el visitante pregunte por disponibilidad o quiera " +
    'agendar. Fechas en formato "YYYY-MM-DD"; para un solo día usa ' +
    "dateStart === dateEnd. Solo consulta disponibilidad; no agenda nada.",
  inputSchema: jsonSchema<{ dateStart: string; dateEnd: string }>({
    type: "object",
    additionalProperties: false,
    properties: {
      dateStart: {
        type: "string",
        description:
          'Primer día del rango, formato "YYYY-MM-DD" (ej. 2026-07-03). ' +
          "Para un solo día, igual a dateEnd.",
      },
      dateEnd: {
        type: "string",
        description:
          'Último día del rango (inclusive), formato "YYYY-MM-DD". ' +
          "Para un solo día, igual a dateStart.",
      },
    },
    required: ["dateStart", "dateEnd"],
  }),
  execute: async ({ dateStart, dateEnd }): Promise<GetAvailabilityResult> => {
    // 1) Formato estricto; sin él los clamps por comparación de strings no valen.
    if (!DATE_RE.test(dateStart) || !DATE_RE.test(dateEnd)) {
      return { ok: false, reason: "bad_input" };
    }
    // 2) Nunca consultar el pasado: "hoy" en la zona del negocio (en-CA formatea
    //    YYYY-MM-DD, comparable como string).
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIMEZONE,
    }).format(new Date());
    if (dateStart < today) dateStart = today;
    // 3) Rango invertido → un solo día.
    if (dateEnd < dateStart) dateEnd = dateStart;
    // 4) Tope de 31 días (aritmética UTC sobre string ya validado).
    const maxEnd = new Date(
      Date.parse(dateStart + "T00:00:00Z") + (MAX_RANGE_DAYS - 1) * 86_400_000
    )
      .toISOString()
      .slice(0, 10);
    if (dateEnd > maxEnd) dateEnd = maxEnd;

    const range = { dateStart, dateEnd };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateStart, dateEnd }),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, reason: "unavailable" };
      return normalize(await res.json(), range);
    } catch {
      // Timeout, red caída o JSON inválido → sentinela; el asistente nunca inventa.
      return { ok: false, reason: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  },
});
