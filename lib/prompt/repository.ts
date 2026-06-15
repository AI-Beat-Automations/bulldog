import { desc, eq } from "drizzle-orm";

import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai";
import { db } from "@/lib/db";
import { promptVersions } from "@/lib/db/schema";

export interface PromptVersion {
  id: string;
  body: string;
  isActive: boolean;
  createdAt: Date;
}

/** Versión activa actual, o null si todavía no existe ninguna. */
export async function getActiveVersion(): Promise<PromptVersion | null> {
  const [row] = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.isActive, true))
    .limit(1);
  return row ?? null;
}

/**
 * Cuerpo del system prompt que recibe el modelo en cada request de chat:
 * la versión activa o, si todavía no hay ninguna, el DEFAULT hardcodeado.
 */
export async function getActiveSystemPrompt(): Promise<string> {
  const active = await getActiveVersion();
  return active?.body ?? DEFAULT_SYSTEM_PROMPT;
}

/** Historial completo de versiones, más reciente primero. */
export async function listVersions(): Promise<PromptVersion[]> {
  return db
    .select()
    .from(promptVersions)
    .orderBy(desc(promptVersions.createdAt), desc(promptVersions.id));
}

/**
 * Crea una versión nueva y la activa (en una transacción). Dedupe: si el texto
 * (trim) es idéntico a la versión activa, no hace nada. Lanza si el cuerpo está
 * vacío — el prompt nunca se puede dejar en blanco.
 */
export async function saveNewActiveVersion(
  rawBody: string
): Promise<{ created: boolean }> {
  const body = rawBody.trim();
  if (body.length === 0) {
    throw new Error("El prompt no puede estar vacío.");
  }

  const active = await getActiveVersion();
  if (active && active.body.trim() === body) {
    return { created: false };
  }

  await db.transaction(async (tx) => {
    // Apagar la activa ANTES de prender la nueva: nunca hay dos activas a la vez
    // (respeta el índice único parcial).
    await tx
      .update(promptVersions)
      .set({ isActive: false })
      .where(eq(promptVersions.isActive, true));
    await tx.insert(promptVersions).values({ body, isActive: true });
  });

  return { created: true };
}

/**
 * Activa una versión existente moviendo el puntero (en una transacción). No
 * duplica texto: solo cambia `is_active`. Lanza (y revierte) si el id no existe.
 */
export async function activateVersion(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(promptVersions)
      .set({ isActive: false })
      .where(eq(promptVersions.isActive, true));
    const updated = await tx
      .update(promptVersions)
      .set({ isActive: true })
      .where(eq(promptVersions.id, id))
      .returning({ id: promptVersions.id });
    if (updated.length === 0) {
      throw new Error(`Versión no encontrada: ${id}`);
    }
  });
}
