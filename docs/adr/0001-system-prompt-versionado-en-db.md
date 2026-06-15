---
status: accepted
---

# System Prompt versionado en DB con puntero activo explícito

El System Prompt era una constante de módulo (`lib/ai.ts`) leída de la env
`CHAT_SYSTEM_PROMPT` al boot, no editable sin redeploy. Lo movemos a una tabla
`prompt_versions` (append-only) de la que el chat lee la **Active Version** en
cada request. Elegimos un puntero activo explícito (`is_active` + índice único
parcial `WHERE is_active`) en vez de "la más reciente gana", porque el admin
quiere poder reactivar cualquier versión pasada sin duplicar su texto. Nunca se
borra ninguna versión (cumple "no lo podemos borrar, solo actualizar").

## Considered Options

- **Columna en una tabla `settings` (sobrescritura en sitio).** Más simple, pero
  pierde el historial; descartada porque "no borrar" se interpretó como conservar
  versiones pasadas.
- **Versionado con "latest-wins" (sin `is_active`).** Revertir obligaría a
  insertar una copia de una versión vieja. Descartada a favor del puntero
  explícito para activar versiones existentes sin duplicar.

## Consequences

- `CHAT_SYSTEM_PROMPT` y el export `SYSTEM_PROMPT` quedan **jubilados**; el único
  fallback cuando no hay Active Version es el `DEFAULT_SYSTEM_PROMPT` hardcodeado.
- El route del chat hace un SELECT extra por request (sin cache): los cambios de
  prompt aplican al instante. Aceptable al volumen actual (rate limit 20/10min/IP).
- La migración solo crea la tabla (sin seed): con cero versiones el chat usa el
  DEFAULT y el primer "Guardar" del admin crea la v1 activa.
- Los server actions de guardado/activación deben re-chequear `auth()` por sí
  mismos (son endpoints POST independientes del guard de página).
