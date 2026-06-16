import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Dog, LogOut } from "lucide-react";

import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AdminTopNav } from "@/components/layout/admin-top-nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const email = session.user?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-5">
        <div className="flex items-center gap-5">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Dog className="size-4" />
            </span>
            <span className="text-[14.5px] font-semibold -tracking-[0.01em] text-foreground">
              Bulldog
            </span>
            <span className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Admin
            </span>
          </Link>
          <AdminTopNav />
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="flex size-[30px] items-center justify-center rounded-full bg-secondary text-[12.5px] font-semibold text-secondary-foreground">
            {initial}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Salir"
              title={email ? `Salir (${email})` : "Salir"}
              className="text-muted-foreground"
            >
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
