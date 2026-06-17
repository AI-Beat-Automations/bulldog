"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavItemActive } from "@/components/layout/nav-items";

const tabClass =
  "inline-flex h-14 items-center border-b-2 border-transparent px-1 text-[13.5px] transition-colors";

function tabState(active: boolean) {
  return active
    ? "border-primary font-semibold text-foreground"
    : "font-medium text-muted-foreground hover:text-foreground";
}

export function AdminTopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-14 items-center gap-4">
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={active}
            className={cn(tabClass, tabState(active))}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
