import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-sm font-semibold text-foreground">Bulldog · Admin</span>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{session.user?.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="hover:text-foreground hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
