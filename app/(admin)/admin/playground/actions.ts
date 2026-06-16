"use server";

import { auth } from "@/lib/auth";
import { loadHistory, type HistoryMessage } from "@/lib/chat/persistence";

// Resume del Playground: al recargar, el cliente recupera el hilo en curso desde
// la DB (la verdad) usando el conversationId guardado en localStorage. Autenticado
// por sí mismo (server action independiente del guard de página).
export async function loadPlaygroundThread(
  id: string
): Promise<HistoryMessage[]> {
  const session = await auth();
  if (!session) return [];
  return loadHistory(id);
}
