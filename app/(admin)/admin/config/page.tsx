import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai";
import { getActiveVersion, listVersions } from "@/lib/prompt/repository";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { activatePrompt, savePrompt } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function preview(body: string) {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
}

const NOTICES: Record<string, { text: string; tone: "ok" | "error" }> = {
  saved: { text: "Prompt guardado. Es la versión activa.", tone: "ok" },
  nochange: {
    text: "Sin cambios: el texto es idéntico a la versión activa.",
    tone: "ok",
  },
  activated: { text: "Versión activada.", tone: "ok" },
  empty: { text: "El prompt no puede estar vacío.", tone: "error" },
};

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const [active, versions, { status }] = await Promise.all([
    getActiveVersion(),
    listVersions(),
    searchParams,
  ]);

  const initialBody = active?.body ?? DEFAULT_SYSTEM_PROMPT;
  const notice = status ? NOTICES[status] : undefined;
  const total = versions.length;
  // versions viene más reciente primero; numeramos v1 (más vieja) … vN (más nueva).
  const versionNumber = (index: number) => total - index;
  const activeNumber = (() => {
    const idx = versions.findIndex((v) => v.isActive);
    return idx === -1 ? null : versionNumber(idx);
  })();

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold -tracking-[0.02em] text-foreground">
            Configuración
          </h1>
          <p className="text-[13.5px] text-muted-foreground">
            Instrucciones que recibe el modelo en cada conversación. Al guardar se
            crea una versión nueva y se activa; las versiones no se borran.
          </p>
        </div>

        {notice ? (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-sm",
              notice.tone === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary text-foreground"
            )}
          >
            {notice.text}
          </p>
        ) : null}

        <form
          action={savePrompt}
          className="rounded-[13px] border border-border bg-card p-[18px] shadow-xs"
        >
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <label
              htmlFor="prompt-body"
              className="text-[13.5px] font-semibold text-foreground"
            >
              Prompt del asistente
            </label>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {active
                ? `Versión activa${activeNumber ? ` · v${activeNumber}` : ""}`
                : "Sin versión activa"}
            </span>
          </div>

          {!active ? (
            <p className="mb-3 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Todavía no hay versión guardada; el chat usa el prompt por defecto.
              Guarda para crear la primera versión.
            </p>
          ) : null}

          <Textarea
            id="prompt-body"
            key={active?.id ?? "default"}
            name="body"
            required
            defaultValue={initialBody}
            rows={8}
            className="min-h-[180px] resize-y rounded-[10px] bg-muted font-mono text-[13px] leading-[1.65] shadow-none"
            aria-label="System prompt"
          />
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="lg">
              Guardar versión
            </Button>
          </div>
        </form>

        <div className="space-y-2.5">
          <h3 className="text-[13.5px] font-semibold text-foreground">
            Historial de versiones
          </h3>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay versiones guardadas.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-xs">
              {versions.map((v, index) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3.5 border-t border-border/70 px-4 py-3.5 first:border-t-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium tabular-nums text-foreground">
                        v{versionNumber(index)}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {dateFormatter.format(new Date(v.createdAt))}
                      </span>
                      {v.isActive ? (
                        <span className="rounded-md bg-secondary px-2 py-0.5 text-[11.5px] font-medium text-secondary-foreground">
                          Activa
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-[440px] truncate text-xs text-muted-foreground">
                      {preview(v.body)}
                    </p>
                  </div>
                  {v.isActive ? null : (
                    <form action={activatePrompt} className="shrink-0">
                      <input type="hidden" name="id" value={v.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Activar
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
