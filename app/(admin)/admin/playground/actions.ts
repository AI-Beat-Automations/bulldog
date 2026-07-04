"use server";

import { auth } from "@/lib/auth";
import { loadThread, type ThreadItem } from "@/lib/chat/persistence";

// Resume del Playground: al recargar, el cliente recupera el hilo en curso desde
// la DB (la verdad) usando el conversationId guardado en localStorage. Incluye
// el Registro de Tool (el cliente sintetiza las burbujas). Autenticado por sí
// mismo (server action independiente del guard de página).
export async function loadPlaygroundThread(id: string): Promise<ThreadItem[]> {
  const session = await auth();
  if (!session) return [];
  return loadThread(id);
}
