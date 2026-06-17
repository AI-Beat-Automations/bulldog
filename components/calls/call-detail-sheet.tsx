"use client";

import { useState } from "react";
import type { InferSelectModel } from "drizzle-orm";

import type { calls } from "@/lib/db/schema";
import { formatUsPhone } from "@/lib/phone";
import { isAudioExpired } from "@/lib/recording";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InlineAudioPlayer } from "@/components/calls/inline-audio-player";
import { CallTranscript } from "@/components/calls/call-transcript";
import {
  formatCost,
  formatDate,
  formatDuration,
  statusBadge,
} from "@/components/calls/calls-client";

type Call = InferSelectModel<typeof calls>;

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{value ?? "—"}</div>
    </div>
  );
}

function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="truncate font-mono text-xs text-foreground">
          {value}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {copied ? "Copiado" : "Copiar"}
      </span>
    </button>
  );
}

export function CallDetailSheet({
  call,
  open,
  onClose,
}: {
  call: Call | null;
  open: boolean;
  onClose: () => void;
}) {
  const hasAudio = !!call?.audioUrl;
  const audioExpired = call ? isAudioExpired(call.createdAt) : false;
  const audioPlayable = hasAudio && !audioExpired;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 p-0 sm:max-w-[560px]">
        {call ? (
          <>
            <SheetHeader className="border-b border-border p-6">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-semibold text-secondary-foreground">
                  {(call.customerName?.trim()?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle>{call.customerName ?? "Unknown"}</SheetTitle>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {formatUsPhone(call.customerPhone) || "—"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {statusBadge(call.callStatus)}
                    {call.disconnectionReason ? (
                      <span className="text-[11px] text-muted-foreground">
                        {call.disconnectionReason}
                      </span>
                    ) : null}
                    <Badge variant="muted">
                      {formatDuration(call.durationMs)}
                    </Badge>
                    <Badge variant="muted">
                      {formatDate(call.callDate ?? call.createdAt)}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <CopyableId label="Internal ID" value={call.id} />
                <CopyableId label="Retell ID" value={call.callId} />
              </div>
            </SheetHeader>

            {audioPlayable ? (
              <InlineAudioPlayer src={call.audioUrl!} />
            ) : hasAudio ? (
              <div className="border-b border-border px-6 py-3.5">
                <Badge variant="warning">Audio expired</Badge>
              </div>
            ) : (
              <div className="border-b border-border px-6 py-3.5 text-sm text-muted-foreground">
                No audio
              </div>
            )}

            <Tabs defaultValue="call" className="min-h-0 flex-1 gap-0 p-6">
              <TabsList>
                <TabsTrigger value="call">Call</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
              </TabsList>

              <TabsContent value="call" className="pt-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <DetailField
                    label="Customer"
                    value={call.customerName ?? "—"}
                  />
                  <DetailField
                    label="Phone"
                    value={formatUsPhone(call.customerPhone) || "—"}
                  />
                  <DetailField
                    label="Address"
                    value={call.customerAddress ?? "—"}
                  />
                  <DetailField label="City" value={call.customerCity ?? "—"} />
                  <DetailField
                    label="Zipcode"
                    value={call.customerZipcode ?? "—"}
                  />
                  <DetailField label="Service" value={call.service ?? "—"} />
                  <DetailField
                    label="Date"
                    value={formatDate(call.callDate ?? call.createdAt)}
                  />
                  <DetailField
                    label="Duration"
                    value={formatDuration(call.durationMs)}
                  />
                  <DetailField
                    label="Call cost"
                    value={formatCost(call.callCost)}
                  />
                  <DetailField
                    label="Summary"
                    value={call.summary ?? "—"}
                    className="col-span-2"
                  />
                </div>
              </TabsContent>

              <TabsContent value="transcript" className="pt-5">
                <CallTranscript transcript={call.transcript} />
              </TabsContent>
            </Tabs>

            {audioPlayable ? (
              <SheetFooter className="border-t border-border">
                <Button asChild variant="outline">
                  <a href={call.audioUrl!} download>
                    Download audio
                  </a>
                </Button>
              </SheetFooter>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
