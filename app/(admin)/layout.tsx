import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Dog, LogOut } from "lucide-react";

import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const email = session.user?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/65 sm:px-6">
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs">
              <Dog className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">Bulldog</span>
            <span className="hidden rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground sm:inline">
              Admin
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <ThemeToggle />
          <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initial}
            </span>
            <span className="max-w-[180px] truncate text-sm text-muted-foreground">{email}</span>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
