import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { normalizeEmail } from "@/lib/utils";

// Comparación de tiempo constante sin node:crypto, para que este módulo sea
// seguro de importar desde el middleware (proxy.ts corre en edge runtime).
function safeEq(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = process.env.AUTH_EMAIL;
        const password = process.env.AUTH_PASSWORD;
        if (!email || !password) return null;
        if (!credentials?.email || !credentials?.password) return null;
        const okEmail = safeEq(
          normalizeEmail(credentials.email as string),
          normalizeEmail(email)
        );
        const okPass = safeEq(credentials.password as string, password);
        return okEmail && okPass ? { id: "admin", email } : null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
});
