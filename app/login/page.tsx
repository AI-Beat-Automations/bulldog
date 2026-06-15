import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/admin");
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/admin",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/login?error=credenciales");
      }
      throw err; // re-lanza el redirect de éxito
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form action={login} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-xs">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Bulldog · Admin</h1>
          <p className="text-sm text-muted-foreground">Inicia sesión para ver las conversaciones.</p>
        </div>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Credenciales inválidas.
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full">Entrar</Button>
      </form>
    </main>
  );
}
