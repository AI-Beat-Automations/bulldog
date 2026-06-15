// Orígenes permitidos para el endpoint público. Coma-separados en env.
// Se incluye SIEMPRE el propio origen (AUTH_URL) para el caso same-origin
// del iframe /widget.
function allowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const self = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  return self ? [...fromEnv, self] : fromEnv;
}

export function isAllowedOrigin(origin: string | null): boolean {
  // Sin header Origin (same-origin no-CORS, curl) → permitido; el rate limit
  // sigue aplicando. La protección real cross-site es la lista de abajo.
  if (!origin) return true;
  return allowedOrigins().includes(origin.replace(/\/$/, ""));
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const o = origin && isAllowedOrigin(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Conversation-Id",
    Vary: "Origin",
  };
}
