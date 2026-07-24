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
      {/* Header — carbón cálido de la barra superior del sitio */}
      <header className="bg-secondary text-secondary-foreground flex shrink-0 items-center gap-2.5 px-3 py-2.5">
        <span
          aria-hidden
          className="bg-primary grid size-8 shrink-0 place-items-center rounded-full text-base"
        >
          🐶
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">Bulldog</span>
          <span className="text-[11px] text-white/70">
            Carpet Cleaning · Las Vegas
          </span>
        </span>
        <button
          type="button"
          onClick={closeWidget}
          aria-label="Close chat"
          className="ml-auto rounded-md px-2 py-1 text-base leading-none text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
          <div className="m-auto px-4 text-center">
            <p className="text-foreground text-sm font-semibold">
              Hi! 👋 We&apos;re Bulldog Carpet Cleaning
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Ask about availability, pricing, or book your visit.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "bg-primary text-primary-foreground max-w-[85%] self-end rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap shadow-xs"
                  : "bg-muted text-foreground border-border max-w-[85%] self-start rounded-2xl rounded-bl-sm border px-3.5 py-2 text-sm whitespace-pre-wrap"
              }
            >
              {messageText(message)}
            </div>
          ))
        )}
        {status === "submitted" ? (
          <div
            className="bg-muted border-border flex max-w-[85%] items-center gap-1 self-start rounded-2xl rounded-bl-sm border px-3.5 py-3"
            aria-label="Typing"
          >
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="bg-primary size-1.5 animate-bounce rounded-full"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        ) : null}
        {error ? (
          <p className="text-destructive self-start text-xs">
            Something went wrong. Please try again.
          </p>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-border flex shrink-0 items-end gap-2 border-t bg-white p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message…"
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleSend}
          disabled={isStreaming || input.trim().length === 0}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
