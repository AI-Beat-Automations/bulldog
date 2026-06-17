import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export default async function CallsPage() {
  const session = await auth();
  if (!session) redirect("/login");

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

        {/* Placeholder temporal: el listado real de llamadas llega en el PR #4. */}
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground shadow-xs">
          No calls found
        </div>
      </div>
    </div>
  );
}
