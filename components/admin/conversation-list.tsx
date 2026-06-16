"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type ConversationSource = "widget" | "playground";

export type ConversationTailLine = {
  role: "user" | "assistant";
  text: string;
};

export type ConversationRow = {
  id: string;
  source: ConversationSource;
  href: string;
  timeLabel: string;
  /** Hasta 2 mensajes en orden cronológico: [penúltimo, último]. */
  tail: ConversationTailLine[];
  /** Texto en minúsculas para el buscador (cliente). */
  search: string;
};

type FilterKey = "all" | "widget" | "playground";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "widget", label: "Clientes" },
  { key: "playground", label: "Playground" },
];

function rolePrefix(role: "user" | "assistant") {
  return role === "user" ? "Cliente: " : "Asistente: ";
}

function SourceChip({ source }: { source: ConversationSource }) {
  const isPlayground = source === "playground";
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          isPlayground ? "bg-muted-foreground/60" : "bg-emerald-500"
        )}
      />
      {isPlayground ? "Playground" : "Cliente"}
    </span>
  );
}

function Row({ row, active }: { row: ConversationRow; active: boolean }) {
  const len = row.tail.length;
  const penultimate = len >= 2 ? row.tail[len - 2] : null;
  const last = len >= 1 ? row.tail[len - 1] : null;

  // top = penúltimo (gris) cuando hay 2; si sólo hay 1, el único va arriba marcado.
  const top = penultimate ?? last;
  const topMarked = penultimate === null && top !== null;
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
        <span className="mt-[3px] flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {bottom ? (
              <>
                <span className="font-semibold">{rolePrefix(bottom.role)}</span>
                {bottom.text}
              </>
            ) : null}
          </span>
          <SourceChip source={row.source} />
        </span>
      </span>
    </Link>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-[5px] text-[12.5px] font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-[5px] px-[5px] text-[10.5px] font-semibold tabular-nums",
          active
            ? "bg-secondary text-secondary-foreground"
            : "bg-border text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
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
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(
    () => ({
      all: rows.length,
      widget: rows.filter((r) => r.source === "widget").length,
      playground: rows.filter((r) => r.source === "playground").length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.source !== filter) return false;
      if (q && !r.search.includes(q)) return false;
      return true;
    });
  }, [rows, query, filter]);

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
        <div className="mt-2.5 flex gap-0.5 rounded-lg bg-secondary p-[3px]">
          {FILTERS.map((f) => (
            <FilterButton
              key={f.key}
              label={f.label}
              count={counts[f.key]}
              active={filter === f.key}
              onClick={() => setFilter(f.key)}
            />
          ))}
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
