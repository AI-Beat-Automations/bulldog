"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabClass =
  "inline-flex h-14 items-center border-b-2 border-transparent px-1 text-[13.5px] transition-colors";

function tabState(active: boolean) {
  return active
    ? "border-primary font-semibold text-foreground"
    : "font-medium text-muted-foreground hover:text-foreground";
}

export function AdminTopNav() {
  const pathname = usePathname();
  const isConfig = pathname.startsWith("/admin/config");
  const isPlayground = pathname.startsWith("/admin/playground");
  // "Conversaciones" cubre /admin y /admin/[id], pero no Playground ni Config.
  const isConversations =
    !isConfig && !isPlayground && pathname.startsWith("/admin");

  return (
    <nav className="flex h-14 items-center gap-4">
      <Link
        href="/admin"
        data-active={isConversations}
        className={cn(tabClass, tabState(isConversations))}
      >
        Conversaciones
      </Link>
      <Link
        href="/admin/playground"
        data-active={isPlayground}
        className={cn(tabClass, tabState(isPlayground))}
      >
        Playground
      </Link>
      <Link
        href="/admin/config"
        data-active={isConfig}
        className={cn(tabClass, tabState(isConfig))}
      >
        Configuración
      </Link>
    </nav>
  );
}
