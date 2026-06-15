"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const linkClass =
  "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground";

export function AdminTopNav() {
  const pathname = usePathname();
  const isConfig = pathname.startsWith("/admin/config");
  const isPlayground = pathname.startsWith("/admin/playground");
  // "Conversaciones" cubre /admin y /admin/[id], pero no Playground ni Config.
  const isConversations =
    !isConfig && !isPlayground && pathname.startsWith("/admin");

  return (
    <nav className="flex items-center gap-0.5">
      <Link href="/admin" data-active={isConversations} className={linkClass}>
        Conversaciones
      </Link>
      <Link
        href="/admin/playground"
        data-active={isPlayground}
        className={linkClass}
      >
        Playground
      </Link>
      <Link href="/admin/config" data-active={isConfig} className={linkClass}>
        Configuración
      </Link>
    </nav>
  );
}
