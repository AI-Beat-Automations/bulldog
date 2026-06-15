import { ChatWidgetClient } from "./chat-widget-client";

// Página pública (excluida de auth en proxy.ts). Renderiza solo el chat.
export default function WidgetPage() {
  return (
    <main className="flex h-screen flex-col bg-background">
      <ChatWidgetClient />
    </main>
  );
}
