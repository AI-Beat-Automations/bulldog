import { jsonSchema, tool } from "ai";

/**
 * Tool del Asistente para crear una Orden (reserva de una Franja completa)
 * contra un webhook de n8n. ESCRIBE: el system obliga al modelo a confirmar
 * cupos, datos completos y un "sí" explícito antes de llamarla (ver CONTEXT.md
 * y docs/adr/0004). Contrato de status sin ambigüedad: HTTP 2xx = creada; el
 * body de la respuesta NO se interpreta. Timeout/red = desenlace desconocido
 * (la orden pudo o no haberse creado) — el servidor jamás reintenta.
 */

/** Nombre con el que el modelo ve la tool; compartido con la inyección al system. */
export const CREATE_ORDER_TOOL = "create_order";

// URL de PRODUCCIÓN por default. Nunca apuntar a /webhook-test/... (en n8n esa URL
// solo responde una vez mientras el editor está "escuchando"). Override por env.
const WEBHOOK_URL =
  process.env.ORDER_WEBHOOK_URL ||
  "https://lori-n8n.glsjow.easypanel.host/webhook/text-create-order";

const FETCH_TIMEOUT_MS = 10_000;

// `YYYY-MM-DD HH:mm:ss`, hora local del negocio, sin `Z` (contrato de n8n).
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export interface CreateOrderInput {
  name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zipcode: string;
  notes: string;
  start_date: string;
  end_date: string;
}

type CreateOrderResult =
  | { ok: true; status: number }
  | { ok: false; reason: "rejected"; status: number }
  | { ok: false; reason: "bad_input" | "unknown_outcome" };

export const createOrderTool = tool({
  description:
    "Crea la orden de reserva de una franja completa para el cliente. Llámala " +
    "SOLO después de confirmar cupos con get_availability, tener los datos " +
    "completos del cliente y recibir su confirmación explícita (reglas en el " +
    "system, arriba).",
  inputSchema: jsonSchema<CreateOrderInput>({
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", description: "Nombre del cliente." },
      last_name: { type: "string", description: "Apellido del cliente." },
      email: { type: "string", description: "Email del cliente." },
      phone: {
        type: "string",
        description: "Teléfono del cliente en E.164 (ej. +17025550123).",
      },
      address: { type: "string", description: "Dirección del servicio." },
      city: { type: "string", description: "Ciudad del servicio." },
      zipcode: { type: "string", description: "Código postal del servicio." },
      notes: {
        type: "string",
        description: "Descripción del servicio solicitado.",
      },
      start_date: {
        type: "string",
        description:
          'Inicio de la franja, "YYYY-MM-DD HH:mm:ss" hora local del negocio, ' +
          "sin Z (ej. 2026-06-29 08:00:00).",
      },
      end_date: {
        type: "string",
        description:
          'Fin de la franja, "YYYY-MM-DD HH:mm:ss" hora local del negocio, ' +
          "sin Z (ej. 2026-06-29 12:00:00).",
      },
    },
    required: [
      "name",
      "last_name",
      "email",
      "phone",
      "address",
      "city",
      "zipcode",
      "notes",
      "start_date",
      "end_date",
    ],
  }),
  execute: async (input): Promise<CreateOrderResult> => {
    // Validación antes de tocar el webhook: fechas con formato exacto y ningún
    // campo vacío. Si algo falla NO se llama a n8n (ninguna orden a medias).
    if (!DATETIME_RE.test(input.start_date) || !DATETIME_RE.test(input.end_date)) {
      return { ok: false, reason: "bad_input" };
    }
    for (const value of Object.values(input)) {
      if (typeof value !== "string" || value.trim().length === 0) {
        return { ok: false, reason: "bad_input" };
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      // Regla única: 2xx = creada; cualquier otro status = rechazada. El body
      // no se interpreta.
      if (res.ok) return { ok: true, status: res.status };
      return { ok: false, reason: "rejected", status: res.status };
    } catch {
      // Timeout o red caída: la orden PUDO o NO haberse creado. Nunca reintentar.
      return { ok: false, reason: "unknown_outcome" };
    } finally {
      clearTimeout(timer);
    }
  },
});
