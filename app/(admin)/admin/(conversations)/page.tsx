import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { auth } from "@/lib/auth";

export default async function AdminConversationsIndexPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageSquare className="size-9" strokeWidth={1.6} />
      <p className="text-[13.5px]">
        Selecciona una conversación para leer la plática.
      </p>
    </div>
  );
}
