"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type ConversationTailLine = {
  role: "user" | "assistant";
  text: string;
};

export type ConversationRow = {
  id: string;
  href: string;
  timeLabel: string;
  /** Hasta 2 mensajes en orden cronológico: [penúltimo, último]. */
  tail: ConversationTailLine[];
  /** Texto en minúsculas para el buscador (cliente). */
  search: string;
};

function rolePrefix(role: "user" | "assistant") {
  return role === "user" ? "Cliente: " : "Asistente: ";
}

function Row({ row, active }: { row: ConversationRow; active: boolean }) {
  const len = row.tail.length;
  const penultimate = len >= 2 ? row.tail[len - 2] : null;
  const last = len >= 1 ? row.tail[len - 1] : null;

  // top = penúltimo (gris) cuando hay 2; si sólo hay 1, el único va arriba marcado.
  const top = penultimate ?? last;
  const topMarked = penultimate === null; // sólo 1 mensaje → marcado arriba
  const bottom = penultimate ? last : null; // último (marcado) cuando hay 2

  return (
    <Link
      href={row.href}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/70 border-l-2 px-3.5 py-3 text-left transition-colors",
        active
          ? "border-l-primary bg-card"
          : "border-l-transparent hover:bg-card/60"
      )}
    >
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground">
        <MessageCircle className="size-[17px]" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              topMarked ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {top ? (
              <>
                <span className="font-medium">{rolePrefix(top.role)}</span>
                {top.text}
              </>
            ) : (
              "(sin mensajes)"
            )}
          </span>
          <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground/80">
            {row.timeLabel}
          </span>
        </span>
        {bottom ? (
          <span className="mt-[3px] block min-w-0 truncate text-[13px] font-medium text-foreground">
            <span className="font-semibold">{rolePrefix(bottom.role)}</span>
            {bottom.text}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function ConversationList({
  rows,
  total,
}: {
  rows: ConversationRow[];
  total: number;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.search.includes(q));
  }, [rows, query]);

  return (
    <>
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-base font-semibold -tracking-[0.01em] text-foreground">
            Conversaciones
          </h1>
          <span className="text-xs tabular-nums text-muted-foreground">
            {total} {total === 1 ? "hilo" : "hilos"}
          </span>
        </div>
        <div className="flex h-[34px] items-center gap-2 rounded-[9px] border border-border bg-card px-2.5 shadow-xs transition-colors focus-within:border-ring">
          <Search className="size-[15px] shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar conversaciones"
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px] text-muted-foreground">
            {rows.length === 0 ? "Sin conversaciones todavía." : "Sin resultados."}
          </div>
        ) : (
          filtered.map((row) => (
            <Row key={row.id} row={row} active={pathname === row.href} />
          ))
        )}
      </div>
    </>
  );
}
