import { BUSINESS_TIMEZONE } from "./timezone";
import { GET_AVAILABILITY_TOOL } from "./tools/get-availability";
import { CREATE_ORDER_TOOL } from "./tools/create-order";

// Reexport para no romper imports existentes (la constante vive en timezone.ts
// para evitar el ciclo system.ts ↔ tools/*).
export { BUSINESS_TIMEZONE } from "./timezone";

/** "ahora" formateado en la zona del negocio, legible para el modelo. */
function formatBusinessNow(): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: BUSINESS_TIMEZONE,
    dateStyle: "full",
    timeStyle: "short",
    hour12: true,
  }).format(new Date());
}

/**
 * Compone el `system` que recibe el modelo en cada request:
 *  1. HASTA ARRIBA, mecánica code-owned: fecha/hora actual + las tools de
 *     disponibilidad y de órdenes + sus reglas de uso.
 *  2. DEBAJO, el System Prompt del Admin (Active Version) intacto.
 *
 * El modelo no puede saber qué día es "hoy", por eso la fecha/hora la inyecta el
 * servidor. Las reglas viven aquí (no en el prompt del Admin) para que un edit
 * del panel no las pueda romper. Ver CONTEXT.md (Disponibilidad / Franja / Orden).
 */
export function buildSystemPrompt(activePrompt: string): string {
  return [
    `Fecha y hora actual del negocio: ${formatBusinessNow()} (${BUSINESS_TIMEZONE}, Las Vegas).`,
    ``,
    `Tienes la herramienta "${GET_AVAILABILITY_TOOL}" para consultar cupos de citas.`,
    `Úsala cuando el visitante pregunte por disponibilidad o quiera agendar.`,
    `"dateStart" y "dateEnd" van en formato YYYY-MM-DD, resueltos con la fecha de arriba:`,
    `- Un día concreto ("el lunes")    → consulta una ventana alrededor: dateStart =`,
    `  ese día − 4 días, dateEnd = ese día + 4 días (el servidor recorta fechas pasadas)`,
    `- Un rango ("esta semana")        → ese rango`,
    `- Sin fecha clara                 → de hoy a hoy + 14 días`,
    `Nunca uses fechas pasadas. Las franjas son "morning" = 8:00–12:00 y`,
    `"afternoon" = 12:00–17:00 (hora de Las Vegas). No inventes cupos: si la`,
    `consulta falla o viene vacía, dilo con claridad y no afirmes que hay espacio.`,
    `Antes de llamar "${GET_AVAILABILITY_TOOL}" revisa el historial: si un resultado`,
    `previo ya cubre las fechas preguntadas, responde desde ahí sin volver a`,
    `llamarla; solo consulta de nuevo si las fechas caen fuera de lo ya visto.`,
    ``,
    `Tienes la herramienta "${CREATE_ORDER_TOOL}" para crear la reserva. Se reserva`,
    `la FRANJA COMPLETA: "start_date" y "end_date" son los límites exactos de la`,
    `franja en formato "YYYY-MM-DD HH:mm:ss", hora local del negocio, sin Z`,
    `(ej. morning del 29 de junio → "2026-06-29 08:00:00" y "2026-06-29 12:00:00").`,
    `Antes de llamarla, SIEMPRE:`,
    `1. Re-consulta "${GET_AVAILABILITY_TOOL}" para el día y franja elegidos JUSTO`,
    `   antes de crear la orden, aunque el historial ya tenga datos — pueden estar`,
    `   vencidos — y confirma que hay cupos > 0.`,
    `2. Reúne conversacionalmente los 8 datos del cliente, todos completos:`,
    `   name, last_name, email, phone, address, city, zipcode y notes (descripción`,
    `   del servicio). Normaliza el teléfono a formato +1XXXXXXXXXX.`,
    `3. Recita el resumen completo de la reserva y espera un "sí" explícito.`,
    `Si la tool responde "rejected", informa que la reserva no se creó; no`,
    `reintentes salvo que el visitante lo pida. Si responde "unknown_outcome",`,
    `informa que no pudiste CONFIRMAR la reserva y que pudo o no quedar`,
    `registrada; NUNCA reintentes por tu cuenta.`,
    ``,
    activePrompt,
  ].join("\n");
}
