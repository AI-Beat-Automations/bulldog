# PRD — Bulldog Chat

> Widget de **chat embebible público** para la compañía **Bulldog**. Los clientes
> finales de Bulldog chatean con un asistente de IA (OpenRouter vía Vercel AI
> SDK) desde un bubble flotante que se inyecta con un `<script>` en su sitio. Un
> **panel de administración** protegido por un único usuario de `.env` permite
> **revisar todas las conversaciones** (historial por `conversationId`).
>
> Reutiliza los patrones del módulo de chat de Eva (`/api/chat`, persistencia,
> AI SDK, página de playground) pero **sin billing por mensaje** y **sin tabla de
> usuarios/roles**: un solo admin definido por variables de entorno.

Documento autosuficiente: incluye esquema, snippets de código adaptados desde
Eva y la lista de componentes a copiar.

> **Conciliado con el hand-off de "Widget de Chat IA Embebible (Multi-tenant)".**
> Decisión tomada: **strictly single-tenant** para Bulldog ahora (sin `tenant_id`,
> config por env). Del hand-off se adoptan las mejoras del loader (iframe lazy,
> Shadow DOM, handshake `postMessage`) y su encuadre de seguridad (el gate real
> del embed es `frame-ancestors`, no CORS). La visión multi-tenant / RAG /
> acciones queda documentada como **roadmap fuera de alcance** en §15.

---

## 1. Objetivo y alcance

### 1.1 Objetivo

Que Bulldog pegue **un solo `<script>`** en su web y aparezca un chat con IA
para sus clientes. Cada conversación se persiste; Bulldog (admin) entra con su
usuario/clave de `.env` y revisa todas las conversaciones. Por ahora **no hay
cobro por mensaje** (el único control de costo es origin allowlist + rate limit).

### 1.2 In scope

- **Widget público embebible**: `widget.js` (loader vanilla: bolita en **Shadow
  DOM**, iframe **lazy** en el primer click, handshake `postMessage`) + página
  `/widget` (UI de chat React con `useChat`, reusando el playground).
- **Endpoint `POST /api/chat`**: streaming desde OpenRouter, **DB como única
  fuente de verdad** del historial, `conversationId` generado por el backend,
  endurecido con **CORS + `ALLOWED_ORIGINS` + rate limit por IP**.
- **Persistencia** de conversaciones y mensajes (igual que Eva).
- **Panel admin** (login único por `.env`): lista de todas las conversaciones +
  vista de hilo de solo lectura.
- **System prompt** configurable por env (`CHAT_SYSTEM_PROMPT`) con default
  genérico.

### 1.3 Out of scope (explícito)

| Eliminado | Motivo |
|---|---|
| Billing por mensaje / ledger / Stripe | Sin cobro por ahora. |
| Tabla `users`, roles, gating por rol | Un solo admin por `.env`. |
| Todo el módulo de Eva fuera del chat: calls, companies, billing, retell, etc. | Solo la parte del chat. |
| `companyId` / multi-tenant en las tablas de chat | Single-tenant (un solo Bulldog). Se elimina el `TODO(multi-tenant)`. |

---

## 2. Stack

Igual que Eva (solo las piezas del chat), más lo que exige el endpoint público:

- **Next.js 16** (App Router, RSC). El middleware se exporta como `proxy` en
  `proxy.ts`. Leer `node_modules/next/dist/docs/` antes de codear (ver `AGENTS.md`).
- **React 19**, **Tailwind v4**, **shadcn/ui**.
- **Vercel AI SDK v6** (`ai@^6`, `@ai-sdk/react@^3`) + **OpenRouter**
  (`@openrouter/ai-sdk-provider@^2`). Nota v6: `useChat` no expone
  `input/handleSubmit`; se envía con `sendMessage({ text })`.
- **Drizzle ORM** + **Postgres (Neon)**. Base nueva, solo tablas `chat_*`.
- **NextAuth (Auth.js v5)** — provider Credentials contra `.env` (solo para el
  panel admin).
- **Nuevas dependencias** (para el endpoint público): `@upstash/ratelimit` +
  `@upstash/redis` (rate limit serverless).
- Deploy en **Vercel** (proyecto nuevo, dominio p.ej. `bulldog-chat.vercel.app`).

Dependencias de Eva que **no** se usan: `stripe`, `@stripe/*`, `retell-sdk`,
`@auth/drizzle-adapter`, `bcryptjs` (admin en texto plano por env).

---

## 3. Modelo de datos

Se reutilizan las dos tablas de chat de Eva **tal cual**, quitando el
`TODO(multi-tenant)` (no habrá `companyId`).

`lib/db/schema.ts`:

```ts
import { pgTable, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "user",
  "assistant",
]);

export const chatConversations = pgTable("chat_conversations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Reconstruye el historial cronológicamente por conversación.
    index("chat_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  ]
);

export const chatConversationsRelations = relations(
  chatConversations,
  ({ many }) => ({ messages: many(chatMessages) })
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));
```

> El listado del admin (§7) calcula preview + conteo con SQL sobre `chat_messages`
> (no se desnormaliza). Si el volumen crece y el orden por "última actividad" se
> vuelve caro, considerar añadir `chat_conversations.last_message_at` actualizado
> en `saveMessage` — fuera de scope v1.

`lib/db/index.ts` y `drizzle.config.ts`: idénticos a Eva (solo cambia
`DATABASE_URL`). `npm run db:generate && npm run db:migrate` → dos tablas
`chat_conversations` y `chat_messages`.

---

## 4. Proveedor de IA y system prompt

`lib/ai.ts` (igual que Eva + system prompt configurable por env):

```ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.warn("[ai] OPENROUTER_API_KEY no configurada; las llamadas fallarán.");
}

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

const openrouter = createOpenRouter({ apiKey: apiKey ?? "or-unset" });

export const chatModel = openrouter(
  process.env.OPENROUTER_MODEL || DEFAULT_MODEL
);

// System prompt configurable sin redeploy de código. Default genérico.
export const SYSTEM_PROMPT =
  process.env.CHAT_SYSTEM_PROMPT ??
  "Eres un asistente de IA útil, claro y conciso. Responde en el mismo idioma del usuario.";

export function assertAiConfigured(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY no está configurada");
  }
}
```

---

## 5. Persistencia

`lib/chat/persistence.ts`: **copiar de Eva sin cambios**. Expone
`createConversation`, `getConversation`, `loadHistory`, `saveMessage`,
`resolveConversation` y `ConversationNotFoundError`. Es la base de verdad del
historial, desacoplada de HTTP y del AI SDK (devuelve `{ role, content }` planos).

Reglas que conserva (idénticas a Eva): id desconocido → `ConversationNotFoundError`
(nunca upsert); `loadHistory` ordena por `createdAt` asc desempatado por `id`.

---

## 6. Endpoint público `POST /api/chat`

Mismo núcleo que Eva (DB como fuente de verdad, `conversationId` server-side en
`X-Conversation-Id`, user msg antes del stream, assistant en `onFinish`,
`consumeStream()` + `abortSignal`), **más** la capa pública: CORS, origin
allowlist, rate limit y preflight `OPTIONS`. **Se elimina** el gating por rol
agency (ya no hay sesión en el path público).

> **Encuadre de seguridad (del hand-off).** Como el chat vive en un `<iframe>`
> servido desde nuestro origen (§7), las llamadas a `/api/chat` desde la UI son
> **same-origin** y NO ejercen CORS. El gate real de "quién puede embeber" es
> **`frame-ancestors`** (§7.4), y el control de costo es el **rate limit**. El
> CORS + `ALLOWED_ORIGINS` de abajo es **defensa en profundidad** para soportar
> (o bloquear) llamadas cross-origin directas al endpoint.

### 6.1 CORS + origin allowlist — `lib/cors.ts`

```ts
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
```

### 6.2 Rate limit — `lib/rate-limit.ts`

```ts
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
```

### 6.3 Route handler — `app/api/chat/route.ts`

```ts
import { streamText } from "ai";

import { assertAiConfigured, chatModel, SYSTEM_PROMPT } from "@/lib/ai";
import {
  ConversationNotFoundError,
  loadHistory,
  resolveConversation,
  saveMessage,
} from "@/lib/chat/persistence";
import { corsHeaders, isAllowedOrigin } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Cliente de DB (pg/Neon) no corre en edge → runtime Node. Techo 30s al stream.
export const maxDuration = 30;

/** Preflight CORS para navegadores cross-origin (el embed.js cruzado). */
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

function extractUserText(body: Record<string, unknown>): string | null {
  if (typeof body.text === "string") return body.text;
  const message = body.message;
  if (message && typeof message === "object") {
    const parts = (message as Record<string, unknown>).parts;
    if (Array.isArray(parts)) {
      return parts
        .filter(
          (p): p is { type: string; text: string } =>
            !!p &&
            typeof p === "object" &&
            (p as Record<string, unknown>).type === "text" &&
            typeof (p as Record<string, unknown>).text === "string"
        )
        .map((p) => p.text)
        .join("");
    }
  }
  return null;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  // 1) Origin allowlist.
  if (!isAllowedOrigin(origin)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }
  const headers = corsHeaders(origin);

  // 2) Rate limit por IP (endpoint público que cuesta tokens).
  const { success } = await rateLimit(clientIp(request));
  if (!success) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers }
    );
  }

  // 3) Body + validación manual (sin zod, como el repo).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "expected object" }, { status: 400, headers });
  }
  const obj = body as Record<string, unknown>;

  const conversationId = obj.conversationId;
  if (conversationId !== undefined && typeof conversationId !== "string") {
    return Response.json(
      { error: "conversationId must be a string" },
      { status: 400, headers }
    );
  }

  const userText = extractUserText(obj);
  if (typeof userText !== "string" || userText.trim().length === 0) {
    return Response.json(
      { error: "message text is required" },
      { status: 400, headers }
    );
  }
  const content = userText.trim();

  // 4) Resolver conversación (id desconocido → 404, nunca upsert).
  let id: string;
  try {
    id = (await resolveConversation(conversationId)).id;
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404, headers }
      );
    }
    throw error;
  }

  assertAiConfigured();

  // 5) Persistir user antes del stream; reconstruir contexto desde la DB.
  await saveMessage({ conversationId: id, role: "user", content });
  const history = await loadHistory(id);

  const result = streamText({
    model: chatModel,
    system: SYSTEM_PROMPT,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    abortSignal: request.signal,
    onFinish: async ({ text }) => {
      const assistantText = text.trim();
      if (assistantText.length === 0) return;
      try {
        await saveMessage({
          conversationId: id,
          role: "assistant",
          content: assistantText,
        });
      } catch (error) {
        console.error(
          "[chat] no se pudo persistir assistant",
          JSON.stringify({ conversationId: id, error: String(error) })
        );
      }
    },
  });

  // Sobrevive desconexión del cliente (corre en background, sin await).
  result.consumeStream();

  // Stream UI-message + CORS + X-Conversation-Id (expuesto vía CORS en §6.1).
  return result.toUIMessageStreamResponse({
    headers: { ...headers, "X-Conversation-Id": id },
  });
}
```

> **Diferencias vs Eva**: (1) se quita `getSessionUser`/`isAgencyRole` (path
> público); (2) se añade origin check + rate limit + `OPTIONS`; (3) todas las
> respuestas llevan headers CORS; (4) `SYSTEM_PROMPT` viene de `lib/ai.ts`
> (env-configurable).

---

## 7. Widget embebible (público)

Bulldog pega **un solo `<script>`**. UX: bolita flotante; al primer click abre el
chat. Patrón Intercom/Crisp, confirmado por el hand-off:

- **`widget.js` (loader)**: vanilla, ~100 líneas, estático. Su único trabajo:
  pintar la bolita y, **en el primer click**, montar un `<iframe>` que carga
  `/widget` (la **misma UI React `useChat`** del playground, servida desde nuestro
  origen). El loader **no es el chat**.
- **Shadow DOM**: la bolita se monta en un shadow root para aislar el CSS del
  sitio anfitrión (que su CSS no rompa la bolita ni al revés).
- **iframe lazy**: el iframe **no se carga al inicio**, solo en el primer click.
  Así el widget pesa kilobytes y no carga la app de Next en visitas que nunca
  abren el chat (performance — clave del hand-off).
- **postMessage**: única comunicación loader↔iframe (cerrar, redimensionar,
  badge de no-leídos). Cada lado valida `event.origin`.
- Las llamadas a `/api/chat` desde el iframe son **same-origin** → sin CORS; el
  gate de "quién puede embeber" es `frame-ancestors` (§7.4).

### 7.1 Snippet que pega Bulldog

```html
<script
  src="https://bulldog-chat.vercel.app/widget.v1.js"
  data-color="#3f5ec2"
  data-title="Bulldog"
  defer
></script>
```

> **Versionado (día 1).** Publicar el loader bajo una URL **estable y versionada**
> (`widget.v1.js`): si un día cambia, los clientes que ya lo embebieron no se
> rompen (publicas `widget.v2.js`). Hosting MVP: `public/widget.v1.js` en Vercel;
> a futuro, CDN (Cloudflare R2) — ver §15. La app del iframe se actualiza libre en
> Vercel; el loader se queda estable.

### 7.2 `public/widget.v1.js` (loader: Shadow DOM + iframe lazy + postMessage)

```js
(function () {
  var script = document.currentScript;
  var base = new URL(script.src).origin;
  var color = script.getAttribute("data-color") || "#3f5ec2";
  var title = script.getAttribute("data-title") || "Chat";

  // Host + shadow root: aísla el CSS del sitio anfitrión.
  var host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483000";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Abrir chat");
  btn.textContent = "💬";
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:56px;height:56px;border:0;" +
    "border-radius:9999px;cursor:pointer;color:#fff;font-size:24px;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.25);background:" + color;
  root.appendChild(btn);

  var iframe = null; // lazy: se crea en el primer click
  var open = false;

  function mountIframe() {
    iframe = document.createElement("iframe");
    iframe.src = base + "/widget?title=" + encodeURIComponent(title);
    iframe.title = title;
    iframe.style.cssText =
      "position:fixed;bottom:88px;right:20px;width:380px;height:560px;border:0;" +
      "border-radius:16px;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.28);" +
      "max-width:calc(100vw - 40px);max-height:calc(100vh - 120px)";
    root.appendChild(iframe);
  }

  function setOpen(next) {
    open = next;
    if (open && !iframe) mountIframe(); // ← carga la app solo aquí (lazy)
    if (iframe) iframe.style.display = open ? "block" : "none";
  }

  btn.addEventListener("click", function () { setOpen(!open); });

  // Handshake: el iframe pide cerrarse / redimensionarse. Validamos origin.
  window.addEventListener("message", function (e) {
    if (e.origin !== base || !e.data || typeof e.data !== "object") return;
    if (e.data.type === "bulldog-chat:close") setOpen(false);
    if (e.data.type === "bulldog-chat:resize" && iframe && e.data.height) {
      iframe.style.height =
        Math.min(e.data.height, window.innerHeight - 120) + "px";
    }
  });
})();
```

> **Variante (futuro, no MVP)**: iframe full-screen transparente con
> `pointer-events:none` salvo donde hay UI (estilo Intercom), que unifica todo el
> diseño en el front a cambio de tener el iframe siempre montado. Solo migrar si
> el diseño partido (bolita en loader / chat en iframe) llega a estorbar.

### 7.3 Página `/widget` (UI de chat)

`app/widget/page.tsx` — full-page sin app shell, fondo transparente, pensada
para vivir dentro del iframe:

```tsx
import { ChatWidgetClient } from "./chat-widget-client";

// Página pública (excluida de auth en proxy.ts). Renderiza solo el chat.
export default function WidgetPage() {
  return (
    <main className="flex h-screen flex-col bg-background">
      <ChatWidgetClient />
    </main>
  );
}
```

`app/widget/chat-widget-client.tsx` — **copiar el `chat-playground-client.tsx`
de Eva** y adaptarlo:

- Quitar la barra de estado de debug del `conversationId` (es de playground).
- **Resume**: persistir el `conversationId` en `localStorage` para continuar al
  recargar; si `/api/chat` responde **404** (id que el server ya no tiene),
  limpiar y reintentar sin id (crea una nueva).
- **postMessage al loader**: un botón "cerrar" hace
  `window.parent.postMessage({ type: "bulldog-chat:close" }, "*")`; opcional,
  reportar el alto del contenido con `bulldog-chat:resize` para que el loader
  ajuste el iframe.

```tsx
// Transport con resume por localStorage + manejo de 404:
function createChatTransport(onConversationId: (id: string) => void) {
  const idHolder = {
    current:
      typeof window !== "undefined"
        ? window.localStorage.getItem("bulldog-conversation-id")
        : null,
  };
  const transport = new DefaultChatTransport<UIMessage>({
    api: "/api/chat", // same-origin dentro del iframe
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        conversationId: idHolder.current ?? undefined,
        message: messages[messages.length - 1], // solo el último (DB = verdad)
      },
    }),
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      if (res.status === 404) {
        // id viejo/desconocido: empezar limpio.
        idHolder.current = null;
        window.localStorage.removeItem("bulldog-conversation-id");
      }
      const headerId = res.headers.get("X-Conversation-Id");
      if (headerId) {
        idHolder.current = headerId;
        window.localStorage.setItem("bulldog-conversation-id", headerId);
        onConversationId(headerId);
      }
      return res;
    },
  });
  return {
    transport,
    reset: () => {
      idHolder.current = null;
      window.localStorage.removeItem("bulldog-conversation-id");
    },
  };
}
```

- El resto (`useChat`, `MessageBubble`, composer, Enter para enviar) se conserva.
  El layout se compacta para el iframe (alto completo, sin paddings de página).
  Copy en **español** (igual que el playground).

### 7.4 Quién puede embeber — CSP `frame-ancestors`

El iframe `/widget` debe poder cargarse **solo** desde los sitios de Bulldog.
Configurar headers (en `next.config.ts` o un `headers()` por ruta) para `/widget`
y `/embed.js`:

```ts
// next.config.ts (headers)
async headers() {
  const ancestors = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean).join(" ");
  return [
    {
      source: "/widget",
      headers: [
        { key: "Content-Security-Policy", value: `frame-ancestors ${ancestors || "'none'"}` },
        // NO poner X-Frame-Options: DENY en esta ruta (rompería el embed).
      ],
    },
  ];
}
```

---

## 8. Panel de administración (login único por `.env`)

Solo el admin de Bulldog entra (usuario/clave en `.env`) y **lee todas las
conversaciones**. Read-only.

### 8.1 Auth — `lib/auth.ts`

Mismo patrón que el PRD de Regal Panes: NextAuth Credentials contra env, sin
tabla `users`, sin roles, comparación de tiempo constante.

```ts
import { timingSafeEqual } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { normalizeEmail } from "@/lib/utils";

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = process.env.AUTH_EMAIL;
        const password = process.env.AUTH_PASSWORD;
        if (!email || !password) return null;
        if (!credentials?.email || !credentials?.password) return null;
        const okEmail = safeEq(
          normalizeEmail(credentials.email as string),
          normalizeEmail(email)
        );
        const okPass = safeEq(credentials.password as string, password);
        return okEmail && okPass ? { id: "admin", email } : null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
});
```

`/login`: copiar la página de Eva, cambiar copy/logo a Bulldog. Redirige a
`/admin` tras login.

### 8.2 Middleware — `proxy.ts`

Público: `/login`, `/widget`, `/embed.js` (estático en `public/`), `/api/chat`,
`/api/auth`. Todo lo demás (el panel `/admin`) requiere sesión.

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/widget") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }
  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
});

export const config = {
  // widget.v1.js vive en public/ y queda fuera del matcher de assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|widget.v1.js|.*\\.svg).*)"],
};
```

### 8.3 Listado — `app/(admin)/admin/page.tsx` (server component)

Lee la DB directo (patrón RSC; no hace falta API para una vista de solo lectura).
Lista conversaciones con preview (primer mensaje del usuario) + conteo, ordenadas
por última actividad.

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatConversations, chatMessages } from "@/lib/db/schema";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function AdminConversationsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Conteo y última actividad por conversación.
  const rows = await db
    .select({
      id: chatConversations.id,
      createdAt: chatConversations.createdAt,
      messageCount: sql<number>`count(${chatMessages.id})::int`,
      lastAt: sql<Date>`max(${chatMessages.createdAt})`,
    })
    .from(chatConversations)
    .leftJoin(chatMessages, eq(chatMessages.conversationId, chatConversations.id))
    .groupBy(chatConversations.id)
    .orderBy(desc(sql`max(${chatMessages.createdAt})`))
    .limit(100);

  return (
    <>
      <PageHeader title="Conversaciones" subtitle="Todas las conversaciones del widget." />
      <PageBody>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conversación</TableHead>
                <TableHead>Mensajes</TableHead>
                <TableHead>Última actividad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-sm text-muted-foreground">
                    Sin conversaciones todavía
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="font-mono text-[12.5px]">
                      <Link href={`/admin/${c.id}`} className="hover:underline">
                        {c.id}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{c.messageCount}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {c.lastAt ? new Date(c.lastAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}
```

> Paginación: v1 corta a 100 (`limit(100)`). Si crece, añadir paginación como en
> `/calls` de Eva (`DataTablePagination`). Opcional: columna preview con el primer
> mensaje del usuario (subconsulta `min(createdAt)` por conversación).

### 8.4 Hilo — `app/(admin)/admin/[id]/page.tsx` (server component, read-only)

```tsx
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConversation, loadHistory } from "@/lib/chat/persistence";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";

export default async function AdminThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) notFound();

  const messages = await loadHistory(id);

  return (
    <>
      <PageHeader title="Conversación" subtitle={id} />
      <PageBody>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Conversación vacía.</p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                  : "max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-foreground"}>
                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide opacity-60">
                    {m.role === "user" ? "Cliente" : "Asistente"}
                  </span>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </PageBody>
    </>
  );
}
```

### 8.5 App shell del admin

Top bar delgado (igual que el PRD de Regal Panes): marca "Bulldog · Admin" a la
izquierda, email + Sign out a la derecha. `/` redirige a `/admin`. Layout
`app/(admin)/layout.tsx` con `auth()` + redirect a `/login`.

---

## 9. Branding, idioma y tema

- **Nombre**: "Bulldog" (widget) / "Bulldog · Admin" (panel). Título del bubble
  configurable por `data-title` en el script.
- **Idioma**: **español** (igual que el playground actual). El system prompt
  responde en el idioma del usuario.
- **Tema**: no se entregó uno para Bulldog. Default: mantener el tema base de
  shadcn (o copiar el de Eva). Se puede pegar un bloque de tweakcn en
  `globals.css` igual que se hizo en el PRD de Regal Panes (primary del bubble =
  `data-color`, default `#3f5ec2`). _Pendiente si Bulldog tiene paleta propia._
- **Logo**: placeholder en `public/`; el bubble usa un emoji 💬 por defecto
  (cambiable a un SVG).

`app/layout.tsx`: `metadata.title = "Bulldog"`, fuentes Geist, `globals.css`.

---

## 10. Variables de entorno

`.env.example`:

```bash
# Base de datos Postgres (Neon) — instancia nueva, solo tablas chat_*.
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# NextAuth (solo para el panel admin)
AUTH_SECRET=your-secret-here
AUTH_URL=https://bulldog-chat.vercel.app   # también es el "self origin" de CORS

# Admin único del panel
AUTH_EMAIL=admin@bulldog.com
AUTH_PASSWORD=cambia-esto

# IA (OpenRouter vía Vercel AI SDK)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-haiku-4.5
# System prompt del asistente (opcional; default genérico en lib/ai.ts)
CHAT_SYSTEM_PROMPT=

# Orígenes permitidos (coma-separados, sin slash final): los dominios de Bulldog
# donde vive el widget. Gate PRINCIPAL = frame-ancestors del iframe /widget
# (§7.4); también alimentan el CORS de defensa-en-profundidad del endpoint.
ALLOWED_ORIGINS=https://bulldog.com,https://www.bulldog.com

# Rate limit (Upstash Redis) — https://upstash.com
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

## 11. Componentes y libs a copiar desde Eva

**Copiar tal cual** (núcleo de chat, sin gating de rol):

- `lib/chat/persistence.ts` (sin cambios).
- `lib/db/index.ts`, `drizzle.config.ts`.
- `lib/utils.ts` (`cn`, `normalizeEmail`).
- `app/(dashboard)/chat-playground/chat-playground-client.tsx` → base de
  `app/widget/chat-widget-client.tsx` (adaptado §7.3).
- `components/ui/*` usados: `button`, `textarea`, `badge`, `table`, `card`,
  `input`, `label`.
- `components/layout/page-header.tsx`, `components/layout/page-body.tsx` (admin).

**Crear nuevo**: `lib/ai.ts` (con `SYSTEM_PROMPT` env, §4), `lib/cors.ts` (§6.1),
`lib/rate-limit.ts` (§6.2), `public/widget.v1.js` (loader, §7.2), `app/widget/*`
(§7.3), `app/(admin)/*` (§8), `lib/auth.ts` env-creds (§8.1), `proxy.ts` (§8.2),
headers `frame-ancestors` en `next.config.ts` (§7.4).

**NO copiar**: nada de calls/companies/billing/retell/stripe; el gating por rol;
`lib/auth-helpers.ts` con roles (el admin no necesita roles).

---

## 12. Pasos de implementación

1. Repo nuevo (o `next` fresco) + copiar el set de §11.
2. Esquema `lib/db/schema.ts` (§3). `npm run db:generate && npm run db:migrate`.
3. `lib/ai.ts` (§4), `lib/cors.ts`, `lib/rate-limit.ts`, `app/api/chat/route.ts`
   (§6). Instalar `@upstash/ratelimit @upstash/redis`.
4. Widget: `public/widget.v1.js` (loader Shadow DOM + iframe lazy + postMessage,
   §7.2), `app/widget/page.tsx` + `chat-widget-client.tsx` (resume + postMessage,
   §7.3), headers `frame-ancestors` en `next.config.ts` (§7.4).
5. Admin: `lib/auth.ts` (§8.1), `proxy.ts` (§8.2), `/login`, `app/(admin)/layout.tsx`
   + top bar, `/admin` (§8.3) y `/admin/[id]` (§8.4), `/` → `/admin`.
6. `.env` (§10): incluir `ALLOWED_ORIGINS`, Upstash, OpenRouter, `AUTH_*`.
7. Probar:
   - **Widget**: en una página de prueba en un origen de `ALLOWED_ORIGINS`, pegar
     el `<script>`, abrir el bubble, mandar un mensaje, ver streaming.
   - **Persistencia/resume**: recargar y confirmar que continúa la conversación
     (localStorage).
   - **CORS/abuse**: un origen NO permitido recibe 403; superar el rate limit
     da 429.
   - **Admin**: login con `AUTH_EMAIL/AUTH_PASSWORD`, ver la conversación en
     `/admin` y su hilo en `/admin/[id]`.

---

## 13. Decisiones clave (semillas de ADR para el repo nuevo)

**ADR-001 — Chat público embebible: loader + iframe, protegido por
frame-ancestors + rate limit.**
El widget es público (sin login). Se entrega como `<script>` (`widget.v1.js`,
loader vanilla) que pinta una **bolita en Shadow DOM** y, en el **primer click**,
monta **lazy** un `<iframe>` a `/widget` (la UI React `useChat` del playground,
servida desde nuestro origen). Loader↔iframe se comunican por `postMessage`
(cerrar/redimensionar). Como el chat vive en el iframe, las llamadas a `/api/chat`
son **same-origin**: el gate de embed lo da **`frame-ancestors`** (CSP con
`ALLOWED_ORIGINS`, enforced por el navegador) y el control de costo es el **rate
limit por IP** (Upstash, sliding window 20/10min); el **CORS** del endpoint queda
como **defensa en profundidad** para llamadas cross-origin directas. Alternativas
descartadas: (a) iframe escrito a mano por el cliente (peor UX, sin bolita);
(b) inyección vanilla en Shadow DOM con `toTextStreamResponse` (no reutiliza el
componente del playground, más frágil); (c) iframe full-screen siempre montado
(carga la app en cada visita — el lazy lo evita). Trade-off: sin protección más
fuerte (captcha, firma por tenant) un abuso desde un origen permitido aún puede
quemar tokens.

**ADR-002 — Admin único definido en variables de entorno.**
Sin tabla `users` ni roles. NextAuth Credentials valida contra `AUTH_EMAIL` /
`AUTH_PASSWORD` (texto plano, comparación de tiempo constante). El middleware
distingue solo "con sesión / sin sesión"; el panel `/admin` es el único espacio
autenticado. Endurecimiento futuro: `AUTH_PASSWORD_HASH` (bcrypt).

**ADR-003 — La base de datos es la única fuente de verdad del historial.**
(Formaliza el "ADR-011" que el código de Eva referencia pero que nunca se
escribió como archivo.) El cliente manda **solo su último mensaje**; el servidor
reconstruye el contexto leyendo la DB. El `conversationId` lo genera **siempre**
el backend y viaja en `X-Conversation-Id`; ids desconocidos → **404**, nunca
upsert. El user msg se persiste **antes** de abrir el stream y el assistant en
`onFinish`, con `consumeStream()` + `abortSignal` para guardar aunque el cliente
se desconecte. Consecuencia: el cliente nunca puede inyectar historial falso ni
elegir su propio id.

---

## 14. Glosario (CONTEXT del producto nuevo)

- **Conversation**: hilo de mensajes identificado por `conversationId` (UUID),
  generado por el backend. Fila en `chat_conversations`. _Avoid_: "chat" a secas,
  "sesión".
- **Message**: turno individual (`chat_messages`), rol `user` (cliente final de
  Bulldog) o `assistant` (el modelo). Orden cronológico por `createdAt`.
- **Widget**: el bubble público embebible (`embed.js` + `/widget`) que usa el
  cliente final, sin login.
- **Admin**: el único usuario autenticado (sesión `{ id: "admin", email }`),
  definido por env; solo **lee** conversaciones en `/admin`. _Avoid_: "agency
  user", "root/admin" (roles de Eva inexistentes aquí).
- **Allowed origin**: dominio de Bulldog autorizado a embeber el widget y a
  llamar `/api/chat` (`ALLOWED_ORIGINS`). Gobierna CORS y `frame-ancestors`.

### Diferencias de lenguaje frente a Eva

- En Eva `/api/chat` exige **sesión agency** (`root`/`admin`) porque "cuesta
  dinero por request"; aquí es **público** y el control de costo es **origin
  allowlist + rate limit**, no la sesión.
- En Eva "Chat Playground" es una **página interna de validación**; aquí la misma
  UI es el **producto** (dentro del iframe del widget), y el "playground" como tal
  desaparece.
- En Eva el rol `user` de un mensaje convive con el "User" (login con rol); aquí
  `user` = **cliente final** de Bulldog y "Admin" = el único login. Sin ambigüedad
  de roles.

---

## 15. Roadmap y fuera de alcance (visión multi-tenant del hand-off)

Decisión explícita: este PRD es **strictly single-tenant** (Bulldog). **No** se
añaden costuras multi-tenant especulativas (sin `tenant_id`, sin tabla `tenants`,
config por env). El hand-off de "Widget de Chat IA Embebible (Multi-tenant)"
describe la visión a largo plazo; se documenta aquí como **roadmap fuera de
alcance** para no perder el contexto, no como trabajo de este PRD.

| Fase (hand-off) | Qué sería | Estado en este PRD |
|---|---|---|
| 0 — Chat + streaming | Endpoint AI SDK con streaming, un "tenant" hardcodeado | ✅ **Incluido** (§4–§6) |
| 1 — Widget + iframe | `widget.js` (bolita) + iframe embebido | ✅ **Incluido** (§7) |
| 2 — Multi-tenant | Tabla `tenants`, `tenant_id` de punta a punta, `data-tenant`, prompt/branding/dominios por tenant, validación de origen **por tenant** | ⛔ **Fuera de alcance.** Hoy: un solo Bulldog, prompt por `CHAT_SYSTEM_PROMPT`, `ALLOWED_ORIGINS` global. |
| 3 — Persistencia | Conversaciones/mensajes en DB, resume | ✅ **Incluido** (§3, §5, §7.3) |
| 4 — Panel admin | (Hand-off: alta/edición de tenants) | 🟡 **Reinterpretado**: el admin de este PRD es **revisión de conversaciones read-only** (§8), no gestión de tenants. |
| 5 — RAG | `pgvector` + embeddings por tenant, ingestión como job de fondo | ⛔ **Fuera de alcance.** |
| 6 — Acciones / N8N | Brazo opcional (correo, CRM, agendar) detrás del agente | ⛔ **Fuera de alcance.** N8N **no** es el cerebro; el motor es el AI SDK. |

**Si Bulldog escala a multi-tenant** (segundo cliente), el camino conocido es la
Fase 2 del hand-off: añadir `tenants` (id, nombre, `system_prompt`, branding,
`allowed_domains[]`), una columna `tenant_id` **nullable** en `chat_conversations`
(migración no destructiva), leer `data-tenant` en el loader → query param del
iframe → `WHERE tenant_id = ?` en cada query, y mover la validación de origen y el
`frame-ancestors` a **por-tenant**. Mientras tanto, esa complejidad se omite a
propósito (decisión "strictly single-tenant").

**Deuda anotada (del hand-off, aplica aunque sea single-tenant):**
- **Historial completo vs recortado**: hoy se manda todo el historial al LLM
  (`loadHistory`). En conversaciones largas crece costo y puede topar el límite de
  contexto → futuro: resumen / ventana deslizante.
- **Límites de Vercel**: `maxDuration` y los topes por plan/runtime cambian;
  verificar en la doc de Vercel al implementar (el streaming entra holgado para
  chat normal).
- **Handshake `postMessage`**: §7 define `close`/`resize`; si se añade badge de
  no-leídos u otros eventos, documentar el contrato completo loader↔iframe.
```

