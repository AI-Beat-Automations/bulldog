import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { listConversationsWithTail } from "@/lib/chat/persistence";
import { type ConversationRow } from "@/components/admin/conversation-list";
import { ConversationsShell } from "@/components/admin/conversations-shell";

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
      source: c.source,
      href: `/admin/${c.id}`,
      timeLabel: timeLabel(c.lastAt),
      tail,
      search: [c.id, ...tail.map((m) => m.text)].join(" ").toLowerCase(),
    };
  });

  return (
    <ConversationsShell rows={rows} total={items.length}>
      {children}
    </ConversationsShell>
  );
}
