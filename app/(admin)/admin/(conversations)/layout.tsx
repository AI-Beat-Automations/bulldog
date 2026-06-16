import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { listConversationsWithTail } from "@/lib/chat/persistence";
import {
  ConversationList,
  type ConversationRow,
} from "@/components/admin/conversation-list";

const timeFmt = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
const dayYearFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function timeLabel(value: Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeFmt.format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "ayer";
  return (date.getFullYear() === now.getFullYear() ? dayFmt : dayYearFmt).format(
    date
  );
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export default async function ConversationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const items = await listConversationsWithTail();

  const rows: ConversationRow[] = items.map((c) => {
    const tail = c.tail.map((m) => ({ role: m.role, text: oneLine(m.content) }));
    return {
      id: c.id,
      href: `/admin/${c.id}`,
      timeLabel: timeLabel(c.lastAt),
      tail,
      search: [c.id, ...tail.map((m) => m.text)].join(" ").toLowerCase(),
    };
  });

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex min-h-0 w-[368px] shrink-0 flex-col border-r border-border bg-muted">
        <ConversationList rows={rows} total={items.length} />
      </aside>
      <section className="flex min-h-0 flex-1 flex-col bg-background">
        {children}
      </section>
    </div>
  );
}
