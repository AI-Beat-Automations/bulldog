import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { getConversation, loadHistory } from "@/lib/chat/persistence";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";

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
      <PageHeader title="Conversación" subtitle={id} />
      <PageBody>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Conversación vacía.</p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                      : "max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-foreground"
                  }
                >
                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide opacity-60">
                    {m.role === "user" ? "Cliente" : "Asistente"}
                  </span>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </PageBody>
    </>
  );
}
