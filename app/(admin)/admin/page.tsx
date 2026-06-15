import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatConversations, chatMessages } from "@/lib/db/schema";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminConversationsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const rows = await db
    .select({
      id: chatConversations.id,
      createdAt: chatConversations.createdAt,
      messageCount: sql<number>`count(${chatMessages.id})::int`,
      lastAt: sql<Date>`max(${chatMessages.createdAt})`,
    })
    .from(chatConversations)
    .leftJoin(chatMessages, eq(chatMessages.conversationId, chatConversations.id))
    .groupBy(chatConversations.id)
    .orderBy(desc(sql`max(${chatMessages.createdAt})`))
    .limit(100);

  return (
    <>
      <PageHeader title="Conversaciones" subtitle="Todas las conversaciones del widget." />
      <PageBody>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conversación</TableHead>
                <TableHead>Mensajes</TableHead>
                <TableHead>Última actividad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-sm text-muted-foreground">
                    Sin conversaciones todavía
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="font-mono text-[12.5px]">
                      <Link href={`/admin/${c.id}`} className="hover:underline">
                        {c.id}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{c.messageCount}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {c.lastAt ? new Date(c.lastAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}
