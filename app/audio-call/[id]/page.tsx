import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Dog } from "lucide-react";

import { db } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { isAudioExpired } from "@/lib/recording";
import { InlineAudioPlayer } from "@/components/calls/inline-audio-player";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Public, unauthenticated page. Keep it out of search indexes.
export const metadata: Metadata = {
  title: "Call recording",
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatRecordingDate(callDate: string | null, createdAt: Date): string {
  // callDate is a free-form text column (an ISO string when set by the
  // webhook). Parse it so it renders human-readable; fall back to createdAt
  // if it's missing or unparseable instead of showing the raw value.
  const source =
    callDate && callDate.trim().length > 0 ? new Date(callDate) : createdAt;
  if (Number.isNaN(source.getTime())) return dateFormatter.format(createdAt);
  return dateFormatter.format(source);
}

function BrandHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Dog className="size-4" />
      </span>
      <span className="text-[14.5px] font-semibold -tracking-[0.01em] text-foreground">
        Bulldog
      </span>
    </div>
  );
}

function UnavailableCard() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3 pt-2 text-center">
          <BrandHeader />
          <CardTitle className="text-xl font-semibold tracking-tight">
            Call recording
          </CardTitle>
          <CardDescription>This recording is unavailable.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

// The [id] segment is the internal calls.id (UUID), used as a bearer key.
// The query is minimized to exactly what's needed to play the recording —
// never transcript, cost, billing, or customer PII.
export default async function AudioCallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const row = await db.query.calls.findFirst({
    where: eq(calls.id, id),
    columns: { audioUrl: true, createdAt: true, callDate: true },
  });

  // Single generic state for the three non-playable cases (missing row,
  // missing/empty audio, expired recording). Don't reveal which one.
  const playable = Boolean(
    row &&
      row.audioUrl &&
      row.audioUrl.trim().length > 0 &&
      !isAudioExpired(row.createdAt),
  );

  if (!playable || !row?.audioUrl) {
    return <UnavailableCard />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3 pt-2 text-center">
          <BrandHeader />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-xl font-semibold tracking-tight">
              Call recording
            </CardTitle>
            <CardDescription>
              {formatRecordingDate(row.callDate, row.createdAt)}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <InlineAudioPlayer src={row.audioUrl} className="border-b-0" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
