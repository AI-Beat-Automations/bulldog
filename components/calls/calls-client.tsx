"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { InferSelectModel } from "drizzle-orm";

import type { calls } from "@/lib/db/schema";
import { formatUsPhone } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CallDetailSheet } from "@/components/calls/call-detail-sheet";

type Call = InferSelectModel<typeof calls>;

// --- Shared display helpers (re-used by the detail sheet) ----------------

export function statusBadge(status: string | null) {
  if (!status) return <Badge variant="secondary">—</Badge>;
  const s = status.toLowerCase();
  let variant: "success" | "destructive" | "warning" | "secondary";
  if (["ended", "completed", "registered"].includes(s)) {
    variant = "success";
  } else if (["failed", "error", "no-answer", "voicemail"].includes(s)) {
    variant = "destructive";
  } else if (["busy", "unknown", "in-progress"].includes(s)) {
    variant = "warning";
  } else {
    variant = "secondary";
  }
  return <Badge variant={variant}>{status}</Badge>;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function formatDate(value: string | Date | null): string {
  if (value == null) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCost(v: string | null): string {
  return v == null ? "—" : "$" + Number(v).toFixed(2);
}

// --- Component -----------------------------------------------------------

export function CallsClient({
  calls,
  total,
  page,
  pageSize,
  q,
}: {
  calls: Call[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(q);
  const [selected, setSelected] = useState<Call | null>(null);

  // Keep the input in sync if `q` changes from the server (e.g. back/forward).
  // Adjust state during render instead of in an effect (React docs pattern).
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setSearch(q);
  }

  // Debounced navigation when the search query changes. Resets to page 1.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = value.trim();
      if (next === q) return;
      const params = new URLSearchParams();
      if (next) params.set("q", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, 250);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function goToPage(target: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Buscar por nombre, teléfono o ID…"
        aria-label="Buscar llamadas"
        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      {calls.length === 0 ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground shadow-xs">
          No calls found
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Customer</TableHead>
                <TableHead className="px-4">Phone</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Duration</TableHead>
                <TableHead className="px-4">Date</TableHead>
                <TableHead className="px-4 text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow
                  key={call.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => setSelected(call)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(call);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="px-4 font-medium text-foreground">
                    {call.customerName ?? "Unknown"}
                  </TableCell>
                  <TableCell className="px-4 font-mono text-muted-foreground">
                    {formatUsPhone(call.customerPhone)}
                  </TableCell>
                  <TableCell className="px-4">
                    {statusBadge(call.callStatus)}
                  </TableCell>
                  <TableCell className="px-4 tabular-nums text-muted-foreground">
                    {formatDuration(call.durationMs)}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground">
                    {formatDate(call.callDate ?? call.createdAt)}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums text-foreground">
                    {formatCost(call.callCost)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          Page {page} of {pages}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <CallDetailSheet
        call={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
