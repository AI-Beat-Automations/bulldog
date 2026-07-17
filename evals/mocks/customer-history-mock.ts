import { jsonSchema, tool } from "ai";
import {
  mapCustomerHistory,
  toWebhookPhone,
  type GetCustomerHistoryResult,
} from "../../lib/chat/tools/get-customer-history";

/**
 * Mock de `get_customer_history` para evals. NO pega al webhook de n8n: resuelve
 * el historial con fixtures deterministas por teléfono, así los tests no
 * dependen de datos vivos de producción (ver ADR-0007). Reutiliza el mapeo real
 * (`mapCustomerHistory`) para que el modelo vea EXACTAMENTE el mismo contrato de
 * salida que en producción; solo cambia la fuente de datos.
 *
 * Fixtures: el teléfono `2028829482` es un cliente existente (Dennis Hades /
 * Gibson Construction); cualquier otro teléfono devuelve "sin datos".
 */

// Respuesta cruda del webhook para el cliente conocido (misma forma que prod;
// solo los campos que el mapeo lee, más que suficientes para el modelo).
const GIBSON_PAYLOAD = {
  name: "Dennis",
  last_name: "Hades",
  email: "dennish@gibsonconstruction.com",
  phone: "7023018504",
  work_orders: [
    {
      custom_number: "WO-006835",
      date_issued: "2026-06-25",
      status_text: "New",
      location: { address_full: "1001 Olsen Street, Henderson, NV, 89011" },
      items: [
        { name: "Carpet cleaning CGD" },
        { name: "Expoxy floor Upstairs" },
        { name: "Epoxy floor Stairs" },
      ],
      total: "7256.25",
    },
    {
      custom_number: "WO-006836",
      date_issued: "2026-06-25",
      status_text: "Invoiced",
      location: { address_full: "1001 Olsen Street, Henderson, NV, 89011" },
      items: [{ name: "Carpet cleaning CGD" }, { name: "Expoxy floor Upstairs" }],
      total: "7256.25",
    },
  ],
};

const EMPTY_PAYLOAD = {
  name: null,
  last_name: null,
  email: null,
  phone: null,
  work_orders: [],
};

// Fixtures indexados por teléfono normalizado (dígitos nacionales).
const FIXTURES: Record<string, unknown> = {
  "2028829482": GIBSON_PAYLOAD,
};

/** Espía por lookup: el teléfono normalizado enviado y si hubo match. */
export interface CustomerLookup {
  phone: string | null;
  found: boolean;
}

export function buildCustomerHistoryMock(captured: CustomerLookup[] = []) {
  return tool({
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
      const normalized = toWebhookPhone(String(phone ?? ""));
      if (!normalized) {
        captured.push({ phone: null, found: false });
        return { ok: false, reason: "bad_input" };
      }
      const payload = FIXTURES[normalized] ?? EMPTY_PAYLOAD;
      const result = mapCustomerHistory(payload);
      captured.push({
        phone: normalized,
        found: result.ok === true && result.found === true,
      });
      return result;
    },
  });
}
