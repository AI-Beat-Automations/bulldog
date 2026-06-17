"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dog, LogOut, Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_ITEMS, isNavItemActive } from "@/components/layout/nav-items";

export function AdminMobileNav({
  email,
  signOutAction,
}: {
  email?: string;
  signOutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground md:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="gap-0" aria-describedby={undefined}>
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Dog className="size-4" />
            </span>
            <span className="text-[14.5px] font-semibold -tracking-[0.01em] text-foreground">
              Bulldog
            </span>
            <span className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Admin
            </span>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-1 p-2">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  data-active={active}
                  className={cn(
                    "rounded-md px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-secondary font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              </SheetClose>
            );
          })}
        </nav>

        <SheetFooter className="border-t border-border">
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
            >
              <LogOut className="size-4" />
              {email ? `Salir (${email})` : "Salir"}
            </Button>
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
