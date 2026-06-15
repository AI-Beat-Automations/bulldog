import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { PlaygroundClient } from "./playground-client";

export default async function PlaygroundPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <>
      <PageHeader
        title="Playground"
        subtitle="Probá el asistente como lo ve un visitante. Usa la versión activa del prompt y guarda cada prueba en el historial (marcada como Playground)."
      />
      <PageBody>
        <PlaygroundClient />
      </PageBody>
    </>
  );
}
