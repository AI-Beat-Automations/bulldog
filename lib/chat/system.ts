import { CHECK_AVAILABILITY_TOOL } from "./tools/check-availability";

// Zona del negocio (Las Vegas). Nombre IANA, no offset fijo → el DST se resuelve
// solo. Override por env si el negocio se mudara de zona.
export const BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE || "America/Los_Angeles";

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
 *  1. HASTA ARRIBA, mecánica code-owned: fecha/hora actual + la tool de
 *     disponibilidad + las reglas para resolver el `date` ISO.
 *  2. DEBAJO, el System Prompt del Admin (Active Version) intacto.
 *
 * El modelo no puede saber qué día es "hoy", por eso la fecha/hora la inyecta el
 * servidor. Las reglas viven aquí (no en el prompt del Admin) para que un edit
 * del panel no las pueda romper. Ver CONTEXT.md (Disponibilidad / Franja / Cupo).
 */
export function buildSystemPrompt(activePrompt: string): string {
  return [
    `Fecha y hora actual del negocio: ${formatBusinessNow()} (${BUSINESS_TIMEZONE}, Las Vegas).`,
    ``,
    `Tienes la herramienta "${CHECK_AVAILABILITY_TOOL}" para consultar cupos de citas.`,
    `Úsala cuando el visitante pregunte por disponibilidad o quiera agendar.`,
    `El parámetro "date" va en ISO 8601 con sufijo Z, resuelto con la fecha de arriba:`,
    `- Fecha y hora completas ("el martes a las 2pm") → ese instante:  2026-06-23T14:00:00.000Z`,
    `- Solo un día ("el sábado")                      → medianoche:     2026-06-20T00:00:00.000Z`,
    `- Sin preferencia                                 → medianoche del día siguiente`,
    `Solo consultas disponibilidad; no puedes agendar. No inventes cupos: si la`,
    `consulta falla o no hay datos, dilo con claridad y no afirmes que hay espacio.`,
    ``,
    activePrompt,
  ].join("\n");
}
