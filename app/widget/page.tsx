import type { CSSProperties } from "react";

import { ChatWidgetClient } from "./chat-widget-client";

// Paleta del sitio de Bulldog Carpet Cleaning. Se aplica SOLO aquí (no en el
// admin, que sigue con los neutros zinc + ámbar de globals.css) sobreescribiendo
// los tokens de shadcn en el contenedor: las utilidades bg-primary, bg-muted,
// border, ring… resuelven contra estas variables dentro del iframe.
// El themeInitScript del layout raíz corre también dentro del iframe y pone
// .dark en <html> si el VISITANTE tiene el sistema en oscuro. Un widget
// embebido en el sitio del cliente debe verse igual para todos, así que este
// script lo deshace antes del primer paint (ambos son inline y síncronos, y
// este va después → gana, sin parpadeo).
const forceLightScript =
  "document.documentElement.classList.remove('dark');" +
  "document.documentElement.style.colorScheme='light';";

const brandTheme = {
  "--background": "#FFFFFF", // sin esto hereda el fondo oscuro del tema
  "--card": "#FFFFFF",
  "--card-foreground": "#2E2529",
  "--popover": "#FFFFFF",
  "--popover-foreground": "#2E2529",
  "--primary": "#02A5F5", // azul del CTA "Book Now!" — burbujas del visitante
  "--primary-foreground": "#FFFFFF",
  "--secondary": "#4D3E44", // carbón cálido (barra superior, botón CONTACT)
  "--secondary-foreground": "#FFFFFF",
  "--muted": "#EFF8FE", // azul lavado para las burbujas del asistente
  "--muted-foreground": "#55707F",
  "--accent": "#A7D1E6", // azul claro del título "CARPET"
  "--accent-foreground": "#4D3E44",
  "--foreground": "#22323B",
  "--border": "#DCEDF9",
  "--input": "#C9E4F7",
  "--ring": "#02A5F5",
} as CSSProperties;

// Página pública (excluida de auth en proxy.ts). Renderiza solo el chat.
export default function WidgetPage() {
  return (
    <main
      style={brandTheme}
      className="bg-background flex h-screen flex-col"
    >
      <script dangerouslySetInnerHTML={{ __html: forceLightScript }} />
      <ChatWidgetClient />
    </main>
  );
}
