"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const STORAGE_KEY = "bulldog-conversation-id";

function createChatTransport(onConversationId: (id: string) => void) {
  const idHolder = {
    current:
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
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
        idHolder.current = null;
        window.localStorage.removeItem(STORAGE_KEY);
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
      window.localStorage.removeItem(STORAGE_KEY);
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

function closeWidget() {
  // El loader (widget.v1.js) escucha este mensaje para ocultar el iframe.
  window.parent.postMessage({ type: "bulldog-chat:close" }, "*");
}

export function ChatWidgetClient() {
  // Transport estable entre renders (resume por localStorage).
  const transportRef = useRef<ReturnType<typeof createChatTransport>>(null);
  if (transportRef.current === null) {
    transportRef.current = createChatTransport(() => {});
  }

  const { messages, sendMessage, status, error } = useChat({
    transport: transportRef.current.transport,
  });

  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const isStreaming = status === "submitted" || status === "streaming";

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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">Bulldog</span>
        <button
          type="button"
          onClick={closeWidget}
          aria-label="Cerrar chat"
          className="text-muted-foreground hover:text-foreground rounded px-2 text-base leading-none"
        >
          ✕
        </button>
      </header>

      {/* Lista de mensajes */}
      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-3"
      >
        {messages.length === 0 ? (
          <p className="text-muted-foreground m-auto text-center text-sm">
            ¿En qué puedo ayudarte?
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "bg-primary text-primary-foreground max-w-[85%] self-end rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                  : "bg-muted text-foreground max-w-[85%] self-start rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
              }
            >
              {messageText(message)}
            </div>
          ))
        )}
        {error ? (
          <p className="text-destructive self-start text-xs">
            Ocurrió un error. Intenta de nuevo.
          </p>
        ) : null}
      </div>

      {/* Composer */}
      <div className="flex shrink-0 items-end gap-2 border-t p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Escribe un mensaje…"
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
    </div>
  );
}
