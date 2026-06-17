import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/widget") ||
    pathname.startsWith("/audio-call") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks")
  ) {
    return NextResponse.next();
  }
  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
});

export const config = {
  // widget.v1.js vive en public/ y queda fuera del matcher de assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|widget.v1.js|.*\\.svg).*)"],
};
