import { asc, eq } from "drizzle-orm";

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
