"use client";

import { useState } from "react";
import { Check, Wrench, X } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Burbuja del Registro de Tool: chip compacto (llamada o resultado) con un
 * popover que muestra el JSON crudo (input de la tool o su output). Un solo
 * componente con trigger dual: hover en desktop (mouse enter/leave controlan
 * `open`) y tap/click en mobile (toggle; Radix cierra al tocar fuera).
 * Se usa en vivo (Playground) y restaurado desde la DB (Playground F5 y el
 * detalle de Conversaciones del admin).
 */
export function ToolBubble({
  kind,
  toolName,
  detail,
  ok,
}: {
  kind: "call" | "result";
  toolName: string;
  detail: unknown;
  ok?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Hover solo con mouse: en touch el tap dispara los eventos de
          // compatibilidad de mouse y abriría/cerraría en el mismo tap. El
          // toggle de click/tap lo aporta el propio Trigger de Radix.
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setOpen(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setOpen(false);
          }}
          className="flex items-center gap-1.5 self-start rounded-full border border-dashed border-border bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground"
        >
          {kind === "call" ? (
            <Wrench className="size-3.5" />
          ) : ok === true ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <X className="size-3.5 text-destructive" />
          )}
          {toolName} {kind === "call" ? "· llamada" : "· resultado"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Mantiene abierto mientras el cursor está sobre el JSON, para poder
        // scrollearlo/copiarlo en desktop.
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setOpen(false);
        }}
        className="w-auto p-0 max-w-[min(90vw,420px)]"
      >
        <pre className="max-h-64 max-w-[min(90vw,420px)] overflow-auto p-2.5 font-mono text-[11px] leading-[1.5]">
          {JSON.stringify(detail, null, 2)}
        </pre>
      </PopoverContent>
    </Popover>
  );
}
