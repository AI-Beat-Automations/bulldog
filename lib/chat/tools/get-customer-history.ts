import { jsonSchema, tool } from "ai";

/**
 * Tool del Asistente para verificar si un teléfono corresponde a un cliente que
 * YA nos compró / tuvo un servicio con nosotros, consultando un webhook de n8n.
 * Solo LEE (no crea nada). Se usa durante el flujo de reserva, en cuanto el
 * Asistente obtiene el teléfono del visitante: si hay historial, saluda al
 * cliente por su nombre y ofrece atender en la misma dirección de archivo
 * (pre-llenando datos conocidos); si no hay historial, sigue el flujo normal de
 * cliente nuevo.
 *
 * Contrato del endpoint (prod):
 *   Request:  { "phone": "2028829482" }  (dígitos nacionales, sin +1 ni símbolos)
 *   Response encontrado:
 *     { "name": "Dennis", "last_name": "Hades", "email": "...",
 *       "phone": "7023018504", "work_orders": [ { ...orden markate... } ] }
 *   Response sin datos:
 *     { "name": null, "last_name": null, "email": null, "phone": null,
 *       "work_orders": [] }
 *
 * El parseo es defensivo: el backend podría omitir campos, mandar `null`, o una
 * lista de órdenes con formas parciales. Nunca inventamos historial.
 */

/** Nombre con el que el modelo ve la tool; compartido con la inyección al system. */
export const GET_CUSTOMER_HISTORY_TOOL = "get_customer_history";

// URL de PRODUCCIÓN por default. Nunca apuntar a /webhook-test/... (en n8n esa URL
// solo responde una vez mientras el editor está "escuchando"). Override por env.
const WEBHOOK_URL =
  process.env.CUSTOMER_HISTORY_WEBHOOK_URL ||
  "https://lori-n8n.glsjow.easypanel.host/webhook/text-history";

const FETCH_TIMEOUT_MS = 10_000;

// Cuántas órdenes y servicios resumimos en el resultado (acota tokens; el
// modelo solo necesita reconocer al cliente y su dirección, no el detalle
// completo de facturación).
const MAX_WORK_ORDERS = 5;
const MAX_SERVICES = 6;

/** Un servicio previo, resumido para el modelo. */
export interface CustomerWorkOrder {
  custom_number: string;
  date_issued: string;
  status_text: string;
  location: string;
  services: string[];
  total: string;
}

export interface CustomerHistoryCustomer {
  name: string;
  last_name: string;
  email: string;
  phone: string;
}

export type GetCustomerHistoryResult =
  | { ok: true; found: false }
  | {
      ok: true;
      found: true;
      customer: CustomerHistoryCustomer;
      work_orders: CustomerWorkOrder[];
    }
  | { ok: false; reason: "bad_input" | "unavailable" };

/**
 * Convierte cualquier entrada de teléfono al formato EXACTO que el webhook
 * espera: dígitos nacionales sin `+1` ni símbolos (ej. `2028829482`). Acepta
 * E.164 (`+12028829482`), 11 dígitos con `1` inicial, o entrada suelta. Devuelve
 * `null` solo si no queda ningún dígito.
 */
export function toWebhookPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  // Quita el prefijo de país US (1) si viene como 11 dígitos.
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length > 0 ? digits : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/**
 * Mapea la respuesta cruda del webhook al resultado que ve el modelo. Exportada
 * para que el mock de evals reutilice EXACTAMENTE el mismo contrato de salida.
 */
export function mapCustomerHistory(payload: unknown): GetCustomerHistoryResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "unavailable" };
  }
  const obj = payload as Record<string, unknown>;
  const rawOrders = Array.isArray(obj.work_orders) ? obj.work_orders : [];

  // "Sin datos" = sin nombre y sin órdenes → cliente nuevo (flujo normal).
  const name = asString(obj.name);
  if (name.trim().length === 0 && rawOrders.length === 0) {
    return { ok: true, found: false };
  }

  const work_orders: CustomerWorkOrder[] = [];
  for (const raw of rawOrders.slice(0, MAX_WORK_ORDERS)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const wo = raw as Record<string, unknown>;
    const loc = (wo.location ?? {}) as Record<string, unknown>;
    const items = Array.isArray(wo.items) ? wo.items : [];
    const services = items
      .slice(0, MAX_SERVICES)
      .map((it) =>
        it && typeof it === "object"
          ? asString((it as Record<string, unknown>).name)
          : ""
      )
      .filter((s) => s.trim().length > 0);
    work_orders.push({
      custom_number: asString(wo.custom_number),
      date_issued: asString(wo.date_issued),
      status_text: asString(wo.status_text),
      location: asString(loc.address_full),
      services,
      total: asString(wo.total),
    });
  }

  return {
    ok: true,
    found: true,
    customer: {
      name,
      last_name: asString(obj.last_name),
      email: asString(obj.email),
      phone: asString(obj.phone),
    },
    work_orders,
  };
}

export const getCustomerHistoryTool = tool({
  description:
    "Verifica si un teléfono corresponde a un cliente que ya nos compró o tuvo " +
    "un servicio con nosotros. Llámala durante la reserva, en cuanto obtengas " +
    "el teléfono del visitante. Si devuelve found=true, saluda al cliente por " +
    "su nombre y ofrece atender en la misma dirección de archivo; si devuelve " +
    "found=false, es cliente nuevo: continúa el flujo normal. Solo consulta; no " +
    "crea ni agenda nada.",
  inputSchema: jsonSchema<{ phone: string }>({
    type: "object",
    additionalProperties: false,
    properties: {
      phone: {
        type: "string",
        description:
          "Teléfono del cliente. Acepta cualquier formato (el servidor lo " +
          "normaliza a dígitos nacionales antes de consultar).",
      },
    },
    required: ["phone"],
  }),
  execute: async ({ phone }): Promise<GetCustomerHistoryResult> => {
    const normalized = toWebhookPhone(asString(phone));
    if (!normalized) return { ok: false, reason: "bad_input" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, reason: "unavailable" };
      return mapCustomerHistory(await res.json());
    } catch {
      // Timeout, red caída o JSON inválido → sentinela; el asistente nunca
      // inventa historial y sigue el flujo normal de cliente nuevo.
      return { ok: false, reason: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  },
});
