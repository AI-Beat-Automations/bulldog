import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai";
import { getActiveVersion, listVersions } from "@/lib/prompt/repository";
import { PlaygroundClient } from "./playground-client";

function preview(body: string) {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > 150 ? `${oneLine.slice(0, 150)}…` : oneLine;
}

export default async function PlaygroundPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [active, versions] = await Promise.all([
    getActiveVersion(),
    listVersions(),
  ]);
  const body = active?.body ?? DEFAULT_SYSTEM_PROMPT;
  const activeIndex = versions.findIndex((v) => v.isActive);
  const versionLabel =
    active && activeIndex !== -1
      ? `Versión v${versions.length - activeIndex}`
      : "Prompt por defecto";

  return (
    <PlaygroundClient promptPreview={preview(body)} versionLabel={versionLabel} />
  );
}
