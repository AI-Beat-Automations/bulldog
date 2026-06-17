import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { verifyN8nSecret } from "@/lib/webhook-auth";
import { mapCallEndedPayload } from "@/lib/calls/map-call-ended-payload";
import { buildPublicRecordingLink } from "@/lib/public-recording-link";

// ADR-004/006: payload comes from n8n (Retell → n8n → Lola). Auth is a shared
// bearer secret. Since ADR-006, call_ended is the single ingestion webhook:
// it carries customer data, metadata, and transcript in one event.
export async function POST(request: Request) {
  const authError = verifyN8nSecret(request);
  if (authError) return authError;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ADR-004 #4 (kept by ADR-006): n8n unwraps Retell's `[{...}]` array before
  // sending. Lola only accepts a flat object; arrays are rejected with 400.
  if (Array.isArray(payload)) {
    return NextResponse.json(
      { error: "expected object, got array" },
      { status: 400 }
    );
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "expected object" }, { status: 400 });
  }
  const callObj = payload as Record<string, unknown>;

  const event = (callObj.event as string | undefined) ?? null;
  if (event !== "call_ended") {
    return new NextResponse(null, { status: 204 });
  }

  const call_id = callObj.call_id as string | undefined;
  const agent_id = callObj.agent_id as string | undefined;
  if (!call_id || !agent_id) {
    return NextResponse.json(
      { error: "call_id and agent_id are required" },
      { status: 400 }
    );
  }

  const mapped = mapCallEndedPayload(callObj);

  const existing = await db.query.calls.findFirst({
    where: and(eq(calls.callId, call_id), eq(calls.agentId, agent_id)),
  });

  let callRowId: string;
  if (existing) {
    await db
      .update(calls)
      .set({
        event: mapped.event ?? event,
        retellEvent: "call_ended",
        callStatus: mapped.callStatus,
        disconnectionReason: mapped.disconnectionReason,
        startTimestamp: mapped.startTimestamp,
        endTimestamp: mapped.endTimestamp,
        durationMs: mapped.durationMs,
        audioUrl: mapped.audioUrl,
        callCost: mapped.callCost,
        // ADR-004 #6 (kept by ADR-006): the "don't overwrite if already
        // populated" rule now guards against n8n reprocess/retry and future
        // manual edits. Only fill when the existing column is null/blank.
        customerName: hasValue(existing.customerName)
          ? existing.customerName
          : mapped.customerName,
        customerPhone: hasValue(existing.customerPhone)
          ? existing.customerPhone
          : mapped.customerPhone,
        summary: hasValue(existing.summary)
          ? existing.summary
          : mapped.summary,
        // Remaining customer fields: keep prior value when the payload omits
        // it so a partial retry can't wipe good data.
        customerAddress: mapped.customerAddress ?? existing.customerAddress,
        customerCity: mapped.customerCity ?? existing.customerCity,
        customerZipcode: mapped.customerZipcode ?? existing.customerZipcode,
        service: mapped.service ?? existing.service,
        callDate: mapped.callDate ?? existing.callDate,
        // Transcript always takes the fresh version when the payload brings
        // a non-empty array; otherwise keep the previous value.
        transcript: mapped.transcript ?? existing.transcript,
        updatedAt: new Date(),
      })
      .where(eq(calls.id, existing.id));
    callRowId = existing.id;
  } else {
    const inserted = await db
      .insert(calls)
      .values({
        callId: call_id,
        agentId: agent_id,
        event: mapped.event ?? event,
        retellEvent: "call_ended",
        callStatus: mapped.callStatus,
        disconnectionReason: mapped.disconnectionReason,
        startTimestamp: mapped.startTimestamp,
        endTimestamp: mapped.endTimestamp,
        durationMs: mapped.durationMs,
        audioUrl: mapped.audioUrl,
        callCost: mapped.callCost,
        customerName: mapped.customerName,
        customerPhone: mapped.customerPhone,
        customerAddress: mapped.customerAddress,
        customerCity: mapped.customerCity,
        customerZipcode: mapped.customerZipcode,
        service: mapped.service,
        summary: mapped.summary,
        callDate: mapped.callDate,
        transcript: mapped.transcript,
      })
      .returning({ id: calls.id });
    callRowId = inserted[0].id;
  }

  // ADR-009: return the Public recording link so n8n can distribute it.
  return NextResponse.json(
    { id: callRowId, url: buildPublicRecordingLink(callRowId) },
    { status: 200 },
  );
}

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
