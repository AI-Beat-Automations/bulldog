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
