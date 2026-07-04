import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { chatConversations, chatMessages } from "@/lib/db/schema";

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation not found: ${id}`);
    this.name = "ConversationNotFoundError";
  }
}

export type ChatRole = "user" | "assistant";

/** Roles del Registro de Tool (llamada y resultado). Ver docs/adr/0005. */
export type ToolRole = "tool_call" | "tool_result";

export type ConversationSource = "widget" | "playground";

export interface HistoryMessage {
  role: ChatRole;
  content: string;
}

/** Fila del hilo completo (mensajes + Registro de Tool), en orden cronológico. */
export interface ThreadItem {
  role: ChatRole | ToolRole;
  content: string;
  payload: Record<string, unknown> | null;
}

export async function createConversation(
  source?: ConversationSource
): Promise<{ id: string; createdAt: Date; source: ConversationSource }> {
  const [row] = await db
    .insert(chatConversations)
    // Omitir source cuando no se pasa → la DB aplica el default 'widget'.
    .values(source ? { source } : {})
    .returning();
  return row;
}

export async function getConversation(
  id: string
): Promise<{ id: string; createdAt: Date; source: ConversationSource } | null> {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, id))
    .limit(1);
  return row ?? null;
}

export interface ConversationListItem {
  id: string;
  source: ConversationSource;
  createdAt: Date;
  messageCount: number;
  lastAt: Date | null;
  /** Hasta 2 mensajes, los más recientes, en orden cronológico (penúltimo, último). */
  tail: HistoryMessage[];
}

/**
 * Listado para el panel de Conversaciones: cada conversación con su conteo,
 * última actividad y los 2 mensajes más recientes (para el preview de la fila).
 * Más reciente primero. Se hace en dos pasos: el agregado y, aparte, los
 * últimos 2 mensajes por conversación vía window function (row_number).
 */
export async function listConversationsWithTail(
  limit = 100
): Promise<ConversationListItem[]> {
  const base = await db
    .select({
      id: chatConversations.id,
      source: chatConversations.source,
      createdAt: chatConversations.createdAt,
      messageCount: sql<number>`count(${chatMessages.id})::int`,
      lastAt: sql<Date | null>`max(${chatMessages.createdAt})`,
    })
    .from(chatConversations)
    // Solo user/assistant: las filas de tool no cuentan como mensajes ni mueven
    // la última actividad del listado.
    .leftJoin(
      chatMessages,
      and(
        eq(chatMessages.conversationId, chatConversations.id),
        inArray(chatMessages.role, ["user", "assistant"])
      )
    )
    .groupBy(chatConversations.id)
    .orderBy(desc(sql`max(${chatMessages.createdAt})`))
    .limit(limit);

  if (base.length === 0) return [];

  const ids = base.map((c) => c.id);
  const tailRows = (await db.execute(sql`
    select conversation_id, role, content
    from (
      select
        ${chatMessages.conversationId} as conversation_id,
        ${chatMessages.role} as role,
        ${chatMessages.content} as content,
        row_number() over (
          partition by ${chatMessages.conversationId}
          order by ${chatMessages.createdAt} desc, ${chatMessages.id} desc
        ) as rn
      from ${chatMessages}
      where ${chatMessages.conversationId} in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})
        and ${chatMessages.role} in ('user', 'assistant')
    ) t
    where rn <= 2
    order by conversation_id, rn desc
  `)) as unknown as Array<{
    conversation_id: string;
    role: ChatRole;
    content: string;
  }>;

  const byConv = new Map<string, HistoryMessage[]>();
  for (const r of tailRows) {
    const arr = byConv.get(r.conversation_id) ?? [];
    arr.push({ role: r.role, content: r.content });
    byConv.set(r.conversation_id, arr);
  }

  return base.map((c) => ({
    id: c.id,
    source: c.source,
    createdAt: c.createdAt,
    messageCount: c.messageCount,
    lastAt: c.lastAt,
    tail: byConv.get(c.id) ?? [],
  }));
}

/** Filas del hilo que entran al contexto del modelo por request. Ver ADR-0006. */
export const MODEL_CONTEXT_ROWS = 25;

/**
 * Ventana de contexto del modelo: las últimas `limit` filas del hilo contando
 * TODO (mensajes de texto Y Registro de Tool), en orden cronológico. El route
 * re-inyecta los pares call/result como mensajes de tool del protocolo.
 * Ver docs/adr/0006.
 */
export async function loadModelContext(
  conversationId: string,
  limit = MODEL_CONTEXT_ROWS
): Promise<ThreadItem[]> {
  const rows = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
      payload: chatMessages.payload,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
  // La query trae las más recientes primero; el modelo las quiere cronológicas.
  return rows.reverse().map((r) => ({
    role: r.role,
    content: r.content,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
  }));
}

/**
 * Hilo completo para las vistas del admin (Playground restore y detalle de
 * Conversaciones): mensajes + Registro de Tool, en orden cronológico.
 */
export async function loadThread(conversationId: string): Promise<ThreadItem[]> {
  const rows = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
      payload: chatMessages.payload,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
  return rows.map((r) => ({
    role: r.role,
    content: r.content,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
  }));
}

export async function saveMessage(input: {
  conversationId: string;
  role: ChatRole;
  content: string;
}): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
  });
}

/** Persiste una fila del Registro de Tool (llamada o resultado). */
export async function saveToolMessage(input: {
  conversationId: string;
  role: ToolRole;
  content: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    payload: input.payload,
  });
}

export async function resolveConversation(
  id?: string | null,
  source?: ConversationSource
): Promise<{ id: string }> {
  if (id === undefined || id === null) {
    // El source solo aplica al crear; un id existente ya tiene el suyo.
    const conv = await createConversation(source);
    return { id: conv.id };
  }
  const existing = await getConversation(id);
  if (!existing) throw new ConversationNotFoundError(id);
  return { id: existing.id };
}
