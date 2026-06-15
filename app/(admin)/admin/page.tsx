import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { ChevronRight, Inbox, MessageSquare } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatConversations, chatMessages } from "@/lib/db/schema";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function shortId(id: string) {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

const filters = [
  { key: "all", label: "Todas", href: "/admin" },
  { key: "widget", label: "Clientes", href: "/admin?source=widget" },
  { key: "playground", label: "Playground", href: "/admin?source=playground" },
] as const;

const filterLinkClass =
  "rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground";

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { source } = await searchParams;
  const activeFilter =
    source === "widget" || source === "playground" ? source : "all";

  const rows = await db
    .select({
      id: chatConversations.id,
      source: chatConversations.source,
      createdAt: chatConversations.createdAt,
      messageCount: sql<number>`count(${chatMessages.id})::int`,
      lastAt: sql<Date>`max(${chatMessages.createdAt})`,
    })
    .from(chatConversations)
    .leftJoin(chatMessages, eq(chatMessages.conversationId, chatConversations.id))
    // where(undefined) es no-op en drizzle → "Todas" sin filtro.
    .where(
      activeFilter === "all"
        ? undefined
        : eq(chatConversations.source, activeFilter)
    )
    .groupBy(chatConversations.id)
    .orderBy(desc(sql`max(${chatMessages.createdAt})`))
    .limit(100);

  return (
    <>
      <PageHeader
        title="Conversaciones"
        subtitle="Conversaciones del widget (clientes reales) y pruebas del Playground."
        actions={
          rows.length > 0 ? (
            <Badge variant="muted" className="px-2.5 py-1 text-sm">
              {rows.length} {rows.length === 1 ? "conversación" : "conversaciones"}
            </Badge>
          ) : null
        }
      />
      <PageBody>
        <nav className="mb-4 flex items-center gap-0.5">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={f.href}
              data-active={activeFilter === f.key}
              className={filterLinkClass}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="size-6" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {activeFilter === "all"
                  ? "Sin conversaciones todavía"
                  : "Sin conversaciones para este filtro"}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeFilter === "playground"
                  ? "Probá el asistente en el Playground y aparecerá aquí."
                  : "Cuando alguien escriba en el widget, aparecerá aquí."}
              </p>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Conversación</TableHead>
                  <TableHead className="px-4">Origen</TableHead>
                  <TableHead className="px-4">Mensajes</TableHead>
                  <TableHead className="px-4">Última actividad</TableHead>
                  <TableHead className="w-10 px-4" aria-label="Abrir" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="group relative cursor-pointer">
                    <TableCell className="px-4 py-3">
                      <Link
                        href={`/admin/${c.id}`}
                        aria-label={`Abrir conversación ${c.id}`}
                        className="absolute inset-0 z-10 rounded-none focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      />
                      <span className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                          <MessageSquare className="size-4" />
                        </span>
                        <span className="font-mono text-[13px] text-foreground">{shortId(c.id)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {c.source === "playground" ? (
                        <Badge variant="default">Playground</Badge>
                      ) : (
                        <Badge variant="muted">Cliente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant="secondary">{c.messageCount}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                      {c.lastAt ? dateFormatter.format(new Date(c.lastAt)) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </PageBody>
    </>
  );
}
