import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  index,
  boolean,
  uniqueIndex,
  bigint,
  integer,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export type TranscriptTurn = { role: "agent" | "user"; content: string };

export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "user",
  "assistant",
]);

// Origen de la conversación: tráfico real del widget vs prueba interna del
// Playground. Default 'widget' → migración no destructiva (filas viejas = widget).
// Ver docs/adr/0002-playground-source-discriminator.md.
export const chatConversationSourceEnum = pgEnum("chat_conversation_source", [
  "widget",
  "playground",
]);

export const chatConversations = pgTable("chat_conversations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  source: chatConversationSourceEnum("source").notNull().default("widget"),
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
    index("chat_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  ]
);

// System prompt versionado. Append-only: cada guardado inserta una versión y
// nunca se borra ninguna. Exactamente una está activa (la que recibe el modelo).
// Ver docs/adr/0001-system-prompt-versionado-en-db.md.
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    body: text("body").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Invariante: a lo sumo una versión activa (índice único parcial).
    uniqueIndex("prompt_versions_active_unique")
      .on(table.isActive)
      .where(sql`is_active`),
    // Listado del historial por fecha (más reciente primero).
    index("prompt_versions_created_idx").on(table.createdAt),
  ]
);

export const calls = pgTable(
  "calls",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    callId: text("call_id").notNull(), // Retell ID
    agentId: text("agent_id").notNull(), // metadata only; does not resolve a company
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    customerCity: text("customer_city"),
    customerZipcode: text("customer_zipcode"),
    service: text("service"),
    summary: text("summary"),
    callDate: text("call_date"), // free-form ISO string from webhook
    event: text("event"),
    retellEvent: text("retell_event"),
    callStatus: text("call_status"),
    disconnectionReason: text("disconnection_reason"), // pure display metadata
    startTimestamp: bigint("start_timestamp", { mode: "number" }),
    endTimestamp: bigint("end_timestamp", { mode: "number" }),
    durationMs: integer("duration_ms"),
    audioUrl: text("audio_url"),
    callCost: numeric("call_cost", { precision: 10, scale: 6 }), // public "Call cost", sourced from payload.call_cost (USD)
    transcript: jsonb("transcript").$type<TranscriptTurn[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("calls_call_id_agent_id_idx").on(table.callId, table.agentId),
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
