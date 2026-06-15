import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Degradación elegante: sin Upstash configurado, no bloquea (warn) — no rompe
// dev/build. En prod, configurar UPSTASH_REDIS_REST_URL/TOKEN.
const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

const ratelimit = hasUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, "10 m"), // 20 mensajes / 10 min / IP
      prefix: "bulldog-chat",
    })
  : null;

export async function rateLimit(key: string): Promise<{ success: boolean }> {
  if (!ratelimit) {
    console.warn("[rate-limit] Upstash no configurado; permitiendo sin límite.");
    return { success: true };
  }
  const { success } = await ratelimit.limit(key);
  return { success };
}

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "unknown";
}
