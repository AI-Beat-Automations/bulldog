"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  ConversationList,
  type ConversationRow,
} from "@/components/admin/conversation-list";

/**
 * Master-detail responsive. En desktop (md+) la lista y el detalle conviven
 * en split. En móvil sólo se ve uno: la lista en /admin y el detalle en
 * /admin/[id]. Como en este grupo de rutas sólo existen esas dos, basta con
 * comparar el pathname con "/admin" para saber si estamos en detalle.
 */
export function ConversationsShell({
  rows,
  total,
  children,
}: {
  rows: ConversationRow[];
  total: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isDetail = pathname !== "/admin";

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-r border-border bg-muted md:w-[368px]",
          isDetail ? "hidden md:flex" : "flex"
        )}
      >
        <ConversationList rows={rows} total={total} />
      </aside>
      <section
        className={cn(
          "min-h-0 flex-1 flex-col bg-background",
          isDetail ? "flex" : "hidden md:flex"
        )}
      >
        {children}
      </section>
    </div>
  );
}
