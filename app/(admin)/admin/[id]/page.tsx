import { redirect, notFound } from "next/navigation";
import { Bot, User } from "lucide-react";

import { auth } from "@/lib/auth";
import { getConversation, loadHistory } from "@/lib/chat/persistence";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    <>
      <PageHeader
        title="Conversación"
        backHref="/admin"
        backLabel="Conversaciones"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs">{id}</span>
            <span aria-hidden className="text-border">·</span>
            <span>Creada el {dateFormatter.format(new Date(conversation.createdAt))}</span>
          </span>
        }
        actions={
          <Badge variant="muted" className="px-2.5 py-1 text-sm">
            {messages.length} {messages.length === 1 ? "mensaje" : "mensajes"}
          </Badge>
        }
      />
      <PageBody>
        <Card className="p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Conversación vacía.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((m, i) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={i}
                    className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
                    </span>
                    <div
                      className={cn(
                        "flex max-w-[80%] flex-col gap-1",
                        isUser ? "items-end" : "items-start",
                      )}
                    >
                      <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {isUser ? "Cliente" : "Asistente"}
                      </span>
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm shadow-xs",
                          isUser
                            ? "rounded-tr-sm bg-primary text-primary-foreground"
                            : "rounded-tl-sm border border-border bg-muted text-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {m.content}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </PageBody>
    </>
  );
}
