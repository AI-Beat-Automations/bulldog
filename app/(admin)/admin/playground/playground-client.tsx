"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, FileText, Plus, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { loadPlaygroundThread } from "./actions";

// Clave SEPARADA de la del widget ("bulldog-conversation-id") para que, sirviendo
// ambos desde el mismo origen, una prueba no pise una conversación del widget.
const STORAGE_KEY = "bulldog-playground-conversation-id";

const SUGGESTIONS = [
  "¿Cuánto cuesta el plan?",
  "¿Dan servicio en mi zona?",
  "Quiero cancelar",
];

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

const PLAYGROUND_INTRO =
  "Hazte pasar por un visitante y prueba al asistente antes de publicar cambios de prompt.";

// Card "Prompt activo": se reutiliza en el aside (desktop) y en el Sheet (móvil).
function PromptActiveCard({
  versionLabel,
  promptPreview,
}: {
  versionLabel: string;
  promptPreview: string;
}) {
  return (
    <div className="rounded-[11px] border border-border bg-card p-3.5 shadow-xs">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">
        Prompt activo
      </div>
      <div className="mb-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-[3px] text-xs text-secondary-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {versionLabel}
        </span>
      </div>
      <p className="text-[12.5px] leading-[1.6] text-muted-foreground">
        {promptPreview}
      </p>
    </div>
  );
}

export function PlaygroundClient({
  promptPreview,
  versionLabel,
}: {
  promptPreview: string;
  versionLabel: string;
}) {
  const [, setConversationId] = useState<string | null>(null);

  // Transport creado una sola vez (useState lazy init); resume por localStorage
  // con clave propia. Evita leer refs durante el render.
  const [transport] = useState(() =>
    createPlaygroundTransport(setConversationId)
  );

  const { messages, sendMessage, status, error, setMessages, stop } = useChat({
    transport: transport.transport,
  });

  const [input, setInput] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
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

  function send(text: string) {
    const t = text.trim();
    if (t.length === 0 || isStreaming) return;
    void sendMessage({ text: t });
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
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[300px] shrink-0 flex-col gap-5 overflow-auto border-r border-border bg-muted px-5 py-[22px] md:flex">
        <div>
          <h1 className="text-[17px] font-semibold -tracking-[0.01em] text-foreground">
            Playground
          </h1>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-muted-foreground">
            {PLAYGROUND_INTRO}
          </p>
        </div>

        <PromptActiveCard versionLabel={versionLabel} promptPreview={promptPreview} />

        <Button
          type="button"
          variant="outline"
          onClick={handleNewConversation}
          className="justify-center gap-1.5"
        >
          <Plus className="size-[15px]" />
          Nueva conversación
        </Button>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col bg-background">
        {/* Barra compacta sólo móvil: el aside no cabe en pantalla angosta. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5 md:hidden">
          <h1 className="text-[15px] font-semibold -tracking-[0.01em] text-foreground">
            Playground
          </h1>
          <div className="flex items-center gap-2">
            <Sheet open={promptOpen} onOpenChange={setPromptOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <FileText className="size-3.5" />
                  Prompt activo
                </Button>
              </SheetTrigger>
              <SheetContent side="right" aria-describedby={undefined}>
                <SheetHeader>
                  <SheetTitle>Playground</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 overflow-auto px-4 pb-4">
                  <p className="text-[13px] leading-[1.55] text-muted-foreground">
                    {PLAYGROUND_INTRO}
                  </p>
                  <PromptActiveCard
                    versionLabel={versionLabel}
                    promptPreview={promptPreview}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={handleNewConversation}
              aria-label="Nueva conversación"
            >
              <Plus className="size-[15px]" />
            </Button>
          </div>
        </div>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-auto bg-muted px-4 py-6 md:px-6 md:py-7"
        >
          <div className="mx-auto flex max-w-[720px] flex-col gap-4">
            {messages.length === 0 ? (
              <div className="mx-auto mt-10 flex max-w-[420px] flex-col items-center gap-4 text-center">
                <span className="flex size-12 items-center justify-center rounded-[13px] bg-primary text-primary-foreground">
                  <Bot className="size-[22px]" />
                </span>
                <p className="text-sm leading-[1.6] text-secondary-foreground">
                  Escribe un mensaje para empezar a probar al asistente.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] text-secondary-foreground transition-colors hover:bg-secondary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap break-words rounded-[15px] px-3.5 py-2.5 text-sm leading-[1.55] [animation:bdfade_.25s_ease_both]",
                    message.role === "user"
                      ? "self-end rounded-tr-[5px] bg-primary text-primary-foreground"
                      : "self-start rounded-tl-[5px] border border-border bg-card text-foreground shadow-xs"
                  )}
                >
                  {messageText(message)}
                </div>
              ))
            )}

            {status === "submitted" ? (
              <div className="flex gap-1.5 self-start rounded-[15px] rounded-tl-[5px] border border-border bg-card px-4 py-3.5 shadow-xs">
                <span className="size-[7px] rounded-full bg-muted-foreground [animation:bdblink_1.2s_infinite]" />
                <span className="size-[7px] rounded-full bg-muted-foreground [animation:bdblink_1.2s_infinite_.2s]" />
                <span className="size-[7px] rounded-full bg-muted-foreground [animation:bdblink_1.2s_infinite_.4s]" />
              </div>
            ) : null}

            {error ? (
              <p className="self-start text-xs text-destructive">
                Ocurrió un error. Intenta de nuevo.
              </p>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-card px-4 py-3.5 md:px-6">
          <div className="mx-auto flex max-w-[720px] items-end gap-2.5">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Escribe un mensaje…"
              rows={1}
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-[10px]"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={isStreaming || input.trim().length === 0}
              aria-label="Enviar"
              className="flex size-[42px] shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
