// Zona del negocio (Las Vegas). Nombre IANA, no offset fijo → el DST se resuelve
// solo. Override por env si el negocio se mudara de zona. Vive en su propio
// módulo para que las tools la importen sin crear el ciclo system.ts ↔ tools/*.
export const BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE || "America/Los_Angeles";
