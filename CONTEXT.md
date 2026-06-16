# Bulldog Chat

Widget de chat embebible que conversa con un LLM (vía OpenRouter). Un admin
configura el comportamiento del asistente; el público anónimo chatea desde el
widget.

## Language

**System Prompt**:
El texto de instrucciones que define cómo se comporta el asistente; se inyecta en el campo `system` de `streamText` y da forma a las respuestas que ve el público.
_Avoid_: "prompt del usuario", "mensaje", "instrucción" (a secas)

**Prompt Version**:
Un registro inmutable del cuerpo del System Prompt en un momento dado; guardar cambios crea una versión nueva (append-only), nunca se borra.
_Avoid_: "el prompt" (a secas, cuando importa distinguir versión vs activa)

**Active Version**:
La única Prompt Version marcada como vigente (`is_active`); es la que el chat le pasa al modelo en cada request.
_Avoid_: "el prompt actual" (ambiguo con "la última editada")

**Playground**:
Superficie interna del panel donde el **Admin** se hace pasar por un visitante y chatea con el **Asistente** para validar su comportamiento antes/después de cambios de prompt. Reintroduce el "Chat Playground" de Eva (el PRD lo había declarado desaparecido). Tercer ítem del nav: Conversaciones · Playground · Configuración.
_Avoid_: "chatear con la gente" (no hay personas reales; es simulación), "bandeja"/"chat en vivo" (no es handoff humano).

**Source** (origen de la Conversation):
De dónde nació un hilo: `widget` (cliente final real, vía bubble embebido) o `playground` (prueba interna del Admin). Las pruebas del Playground SÍ se persisten en el historial, pero marcadas para poder distinguirlas y filtrarlas; el listado de Conversaciones deja de ser "solo widget".
_Avoid_: "canal" (no hay multi-canal: WhatsApp, etc.), "tenant".

**Disponibilidad (Availability)**:
Cupos libres para agendar una **Cita** en un día dado, agrupados por **Franja**. El **Asistente** la consulta (no la calcula) llamando la tool `check_availability` contra un webhook externo de n8n; el negocio opera en `America/Los_Angeles` (Las Vegas). Consultar disponibilidad **NO es agendar** — esta tool solo lee.
_Avoid_: "agenda"/"reservar" (esto no crea ninguna Cita), "calendario" (no exponemos el calendario, solo el conteo).

**Franja**:
Bloque horario del día del negocio en hora de Las Vegas. Hoy n8n devuelve `08-12` (mañana, 8:00–12:00) y `12-17` (tarde, 12:00–17:00); el código las trata como **dinámicas** (itera las que vengan) y solo las traduce a lenguaje humano.
_Avoid_: "horario" (a secas), "turno".

**Cupo**:
Una unidad de Disponibilidad dentro de una Franja. El número que devuelve n8n (`4`) es **cuántos Cupos quedan libres**; `0` o Franja ausente = sin Disponibilidad en esa Franja. El Asistente nunca inventa Cupos: si la respuesta viene vacía, dice que no hay Disponibilidad.
_Avoid_: "slot" en el lenguaje de cara al visitante, "espacio".

## Relationships

- El **System Prompt** gobierna al **Asistente** con el que conversa el público anónimo.
- Existen muchas **Prompt Versions**; exactamente una es la **Active Version** (invariante).
- El cuerpo de la **Active Version** ES el **System Prompt** en runtime; si faltara, se cae a un default hardcodeado.

## Example dialogue

> **Dev:** "Si activo una **Prompt Version** vieja, ¿se duplica el texto?"
> **Admin:** "No — activar solo mueve el puntero `is_active` a esa versión existente. Si luego edito y guardo, ahí sí nace una versión nueva (y solo si el texto cambió)."
> **Dev:** "¿Y si no hay ninguna **Active Version**?"
> **Admin:** "El chat usa el DEFAULT hardcodeado. La env `CHAT_SYSTEM_PROMPT` quedó jubilada."

## Flagged ambiguities

- "el prompt que se le pasa a la gente" se aclaró: NO es un texto visible al usuario, sino el **System Prompt** (instrucciones internas del modelo). Resuelto.
- "no lo podemos borrar, solo actualizar" se aclaró: NO es sobrescritura en sitio, sino historial append-only de **Prompt Versions** con una **Active Version**; nunca se borra ninguna. Resuelto.
- `CHAT_SYSTEM_PROMPT` (env) deja de ser fuente de verdad: la fuente es la **Active Version** en DB; el único fallback es el DEFAULT hardcodeado. Resuelto.
- **Reversión de decisiones del PRD**: el PRD §14 declaraba que "el playground desaparece" y que el **Admin** "solo lee". Decisión nueva (2026-06-15): se **reintroduce el Playground** y el Admin **escribe** mensajes `user` dentro de él. El invariante "Admin read-only" queda acotado al listado de Conversaciones, no al Playground. Resuelto.
- "se van a guardar en el historial" se acotó: las conversaciones de **Playground** se persisten en las mismas tablas pero con **Source** `playground`; no se mezclan sin marca con las del **widget**. Resuelto.
- **Riesgo aceptado (v1)**: la marca **Source** la manda el cliente en el body de `/api/chat` (no la deriva el servidor de la sesión). Es **falsificable** desde afuera → degrada la confiabilidad del listado, no es un fallo de seguridad. Upgrade conocido: derivar `source` de `auth()` en el handler. Aceptado por simplicidad.
