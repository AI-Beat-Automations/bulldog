import { jsonSchema, tool } from "ai";
import type { CreateOrderInput } from "../../lib/chat/tools/create-order";

/**
 * Mock de `create_order` para evals. NUNCA llama al webhook de n8n (el default
 * de ORDER_WEBHOOK_URL apunta a PRODUCCIÓN — ver ADR-0007). Descripción y
 * schema copiados textuales de la tool real para que el modelo vea exactamente
 * el mismo contrato; solo cambia el execute: captura el payload y devuelve el
 * desenlace que el test pida.
 */

export type MockOutcome = "success" | "rejected" | "unknown_outcome";

export function buildCreateOrderMock(
  outcome: MockOutcome = "success",
  captured: CreateOrderInput[] = []
) {
  return tool({
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
    execute: async (input) => {
      captured.push(input);
      // Mismo contrato de desenlaces que la tool real (ADR-0004):
      // 2xx = creada; non-2xx = rechazada; timeout/red = desenlace desconocido.
      if (outcome === "success") return { ok: true, status: 200 };
      if (outcome === "rejected") return { ok: false, reason: "rejected", status: 422 };
      return { ok: false, reason: "unknown_outcome" };
    },
  });
}
