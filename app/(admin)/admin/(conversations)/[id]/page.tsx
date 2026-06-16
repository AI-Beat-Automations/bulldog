import { redirect, notFound } from "next/navigation";
import { Bot, User } from "lucide-react";

import { auth } from "@/lib/auth";
import { getConversation, loadHistory } from "@/lib/chat/persistence";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) notFound();

  const messages = await loadHistory(id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3.5 border-b border-border px-6 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold -tracking-[0.01em] text-foreground">
            Conversación
          </h2>
          <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted-foreground/80">
            {id} · creada {dateFormatter.format(new Date(conversation.createdAt))}
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground">
          {messages.length} {messages.length === 1 ? "mensaje" : "mensajes"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-muted px-6 py-7">
        {messages.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Conversación vacía.
          </div>
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-5">
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3",
                    isUser ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-[30px] shrink-0 items-center justify-center rounded-full",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground"
                    )}
                  >
                    {isUser ? (
                      <User className="size-[15px]" />
                    ) : (
                      <Bot className="size-[15px]" />
                    )}
                  </span>
                  <div
                    className={cn(
                      "flex max-w-[78%] flex-col gap-1.5",
                      isUser ? "items-end" : "items-start"
                    )}
                  >
                    <span className="px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.02em] text-muted-foreground">
                      {isUser ? "Cliente" : "Asistente"}
                    </span>
                    <div
                      className={cn(
                        "rounded-[15px] px-[15px] py-[11px] text-sm leading-[1.55]",
                        isUser
                          ? "rounded-tr-[5px] bg-primary text-primary-foreground"
                          : "rounded-tl-[5px] border border-border bg-card text-foreground shadow-xs"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
