import { redirect } from "next/navigation";
import { count, desc, ilike, or } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { CallsClient } from "@/components/calls/calls-client";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = 20;

  const where = q
    ? or(
        ilike(calls.customerName, `%${q}%`),
        ilike(calls.customerPhone, `%${q}%`),
        ilike(calls.callId, `%${q}%`),
      )
    : undefined;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(calls)
      .where(where)
      .orderBy(desc(calls.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(calls).where(where),
  ]);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold -tracking-[0.02em] text-foreground">
            Calls
          </h1>
          <p className="text-[13.5px] text-muted-foreground">
            Llamadas registradas vía Retell.
          </p>
        </div>

        <CallsClient
          calls={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          q={q}
        />
      </div>
    </div>
  );
}
