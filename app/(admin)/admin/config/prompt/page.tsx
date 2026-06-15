import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai";
import { getActiveVersion, listVersions } from "@/lib/prompt/repository";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
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

export default async function PromptConfigPage({
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Prompt del asistente
        </h2>
        <p className="text-sm text-muted-foreground">
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
              : "bg-muted text-foreground"
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {!active ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          Todavía no hay versión guardada; el chat usa el prompt por defecto.
          Guarda para crear la primera versión.
        </p>
      ) : null}

      <form action={savePrompt} className="space-y-3">
        <Textarea
          key={active?.id ?? "default"}
          name="body"
          required
          defaultValue={initialBody}
          rows={16}
          className="min-h-[320px] font-mono text-[13px] leading-relaxed"
          aria-label="System prompt"
        />
        <div className="flex justify-end">
          <Button type="submit">Guardar</Button>
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Historial</h3>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay versiones guardadas.
          </p>
        ) : (
          <Card className="divide-y divide-border p-0">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums text-foreground">
                      {dateFormatter.format(new Date(v.createdAt))}
                    </span>
                    {v.isActive ? (
                      <Badge variant="secondary">Activa</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {preview(v.body)}
                  </p>
                </div>
                {v.isActive ? null : (
                  <form action={activatePrompt}>
                    <input type="hidden" name="id" value={v.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Activar
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
