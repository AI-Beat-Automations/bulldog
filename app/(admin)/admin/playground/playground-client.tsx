"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { loadPlaygroundThread } from "./actions";

// Clave SEPARADA de la del widget ("bulldog-conversation-id") para que, sirviendo
// ambos desde el mismo origen, una prueba no pise una conversación del widget.
const STORAGE_KEY = "bulldog-playground-conversation-id";

function createPlaygroundTransport(onConversationId: (id: string | null) => void) {
  const idHolder = {
    current:
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null,
  };
  const transport = new DefaultChatTransport<UIMessage>({
    api: "/api/chat", // same-origin (panel autenticado)
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        conversationId: idHolder.current ?? undefined,
        source: "playground", // marca la conversación como prueba (solo al crear)
        message: messages[messages.length - 1], // solo el último (DB = verdad)
      },
    }),
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      if (res.status === 404) {
        idHolder.current = null;
        window.localStorage.removeItem(STORAGE_KEY);
        onConversationId(null);
      }
      const headerId = res.headers.get("X-Conversation-Id");
      if (headerId) {
        idHolder.current = headerId;
        window.localStorage.setItem(STORAGE_KEY, headerId);
        onConversationId(headerId);
      }
      return res;
    },
  });
  return {
    transport,
    reset: () => {
      idHolder.current = null;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    },
  };
}

// Concatena las partes de texto de un mensaje (ignora otras partes).
function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function shortId(id: string) {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function PlaygroundClient() {
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Transport creado una sola vez (useState lazy init); resume por localStorage
  // con clave propia. Evita leer refs durante el render.
  const [transport] = useState(() =>
    createPlaygroundTransport(setConversationId)
  );

  const { messages, sendMessage, status, error, setMessages, stop } = useChat({
    transport: transport.transport,
  });

  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const isStreaming = status === "submitted" || status === "streaming";

  // Resume: al montar, si hay un id guardado, recuperar el hilo desde la DB para
  // que un F5 accidental no borre la prueba en curso.
  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
    if (!stored) return;
    let cancelled = false;
    void loadPlaygroundThread(stored).then((history) => {
      if (cancelled) return;
      setConversationId(stored);
      if (history.length === 0) return;
      setMessages(
        history.map((m, i) => ({
          id: `restored-${i}`,
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        }))
      );
    });
    return () => {
      cancelled = true;
    };
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll al final cuando llegan mensajes nuevos / tokens.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  function handleSend() {
    const text = input.trim();
    if (text.length === 0 || isStreaming) return;
    void sendMessage({ text });
    setInput("");
  }

  // Abandona la conversación actual (queda guardada en el historial) y arranca
  // limpio. El nuevo id se genera en el servidor al mandar el primer mensaje.
  function handleNewConversation() {
    if (isStreaming) stop();
    transport.reset();
    setMessages([]);
    setConversationId(null);
    setInput("");
  }

  return (
    <Card className="flex h-[calc(100dvh-15rem)] min-h-[440px] flex-col overflow-hidden p-0">
      {/* Toolbar */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="default">Playground</Badge>
          {conversationId ? (
            <span className="truncate font-mono text-xs text-muted-foreground">
              {shortId(conversationId)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Nueva conversación
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleNewConversation}
          className="gap-1.5"
        >
          <Plus className="size-4" />
          Nueva conversación
        </Button>
      </header>

      {/* Lista de mensajes */}
      <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
            Escribí un mensaje para probar al asistente, igual que lo haría un
            visitante del widget.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "max-w-[80%] self-end whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                  : "max-w-[80%] self-start whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border bg-muted px-4 py-2.5 text-sm text-foreground"
              }
            >
              {messageText(message)}
            </div>
          ))
        )}
        {error ? (
          <p className="self-start text-xs text-destructive">
            Ocurrió un error. Intentá de nuevo.
          </p>
        ) : null}
      </div>

      {/* Composer */}
      <div className="flex shrink-0 items-end gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Escribí un mensaje…"
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleSend}
          disabled={isStreaming || input.trim().length === 0}
        >
          Enviar
        </Button>
      </div>
    </Card>
  );
}
