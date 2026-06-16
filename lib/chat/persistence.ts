import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { chatConversations, chatMessages } from "@/lib/db/schema";

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation not found: ${id}`);
    this.name = "ConversationNotFoundError";
  }
}

export type ChatRole = "user" | "assistant";

export interface HistoryMessage {
  role: ChatRole;
  content: string;
}

export async function createConversation(): Promise<{
  id: string;
  createdAt: Date;
}> {
  const [row] = await db.insert(chatConversations).values({}).returning();
  return row;
}

export async function getConversation(
  id: string
): Promise<{ id: string; createdAt: Date } | null> {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, id))
    .limit(1);
  return row ?? null;
}

export interface ConversationListItem {
  id: string;
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
      createdAt: chatConversations.createdAt,
      messageCount: sql<number>`count(${chatMessages.id})::int`,
      lastAt: sql<Date | null>`max(${chatMessages.createdAt})`,
    })
    .from(chatConversations)
    .leftJoin(chatMessages, eq(chatMessages.conversationId, chatConversations.id))
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
    createdAt: c.createdAt,
    messageCount: c.messageCount,
    lastAt: c.lastAt,
    tail: byConv.get(c.id) ?? [],
  }));
}

export async function loadHistory(
  conversationId: string
): Promise<HistoryMessage[]> {
  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
  return rows.map((r) => ({ role: r.role, content: r.content }));
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

export async function resolveConversation(
  id?: string | null
): Promise<{ id: string }> {
  if (id === undefined || id === null) {
    const conv = await createConversation();
    return { id: conv.id };
  }
  const existing = await getConversation(id);
  if (!existing) throw new ConversationNotFoundError(id);
  return { id: existing.id };
}
