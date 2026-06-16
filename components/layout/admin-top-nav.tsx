"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabClass =
  "inline-flex h-14 items-center border-b-2 border-transparent px-1 text-[13.5px] transition-colors";

export function AdminTopNav() {
  const pathname = usePathname();
  const isConfig = pathname.startsWith("/admin/config");
  // "Conversaciones" cubre /admin y /admin/[id], pero no la sección de config.
  const isConversations = !isConfig && pathname.startsWith("/admin");

  return (
    <nav className="flex h-14 items-center gap-4">
      <Link
        href="/admin"
        data-active={isConversations}
        className={cn(
          tabClass,
          isConversations
            ? "border-primary font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:text-foreground"
        )}
      >
        Conversaciones
      </Link>
      <Link
        href="/admin/config"
        data-active={isConfig}
        className={cn(
          tabClass,
          isConfig
            ? "border-primary font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:text-foreground"
        )}
      >
        Configuración
      </Link>
    </nav>
  );
}
