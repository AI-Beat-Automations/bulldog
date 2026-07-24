import type { CSSProperties } from "react";

import { ChatWidgetClient } from "./chat-widget-client";

// Paleta del sitio de Bulldog Carpet Cleaning. Se aplica SOLO aquí (no en el
// admin, que sigue con los neutros zinc + ámbar de globals.css) sobreescribiendo
// los tokens de shadcn en el contenedor: las utilidades bg-primary, bg-muted,
// border, ring… resuelven contra estas variables dentro del iframe.
const brandTheme = {
  "--primary": "#EB3471", // rosa de marca (hero, wordmark)
  "--primary-foreground": "#FFFFFF",
  "--secondary": "#4D3E44", // carbón cálido (barra superior, botón CONTACT)
  "--secondary-foreground": "#FFFFFF",
  "--muted": "#FBF1F5", // rosa lavado para las burbujas del asistente
  "--muted-foreground": "#6B575E",
  "--accent": "#A7D1E6", // azul claro del título "CARPET"
  "--accent-foreground": "#4D3E44",
  "--foreground": "#2E2529",
  "--border": "#F0DFE6",
  "--input": "#E7D8DE",
  "--ring": "#EB3471",
} as CSSProperties;

// Página pública (excluida de auth en proxy.ts). Renderiza solo el chat.
export default function WidgetPage() {
  return (
    <main
      style={brandTheme}
      className="bg-background flex h-screen flex-col"
    >
      <ChatWidgetClient />
    </main>
  );
}
