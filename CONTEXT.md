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
Cupos libres para agendar una **Cita** por día y **Franja**, dentro de un rango de fechas. El **Asistente** la consulta (no la calcula) llamando la tool `get_availability` (`dateStart`/`dateEnd` en formato `YYYY-MM-DD`) contra un webhook externo de n8n (lori-n8n); el negocio opera en `America/Los_Angeles` (Las Vegas). Cuando el visitante pregunta por **un día concreto**, el Asistente consulta una **ventana ±4 días** alrededor (el servidor recorta fechas pasadas) para poder responder preguntas cercanas desde el historial sin repetir la llamada; solo re-consulta si las fechas caen fuera de lo ya visto — y SIEMPRE re-consulta justo antes de crear una **Orden** (los Cupos pudieron cambiar). Consultar disponibilidad **NO es agendar** — esta tool solo lee. Reemplaza a la antigua `check_availability` (jumpers-n8n, un solo `date` ISO con `Z`), que queda eliminada.
_Avoid_: "agenda"/"reservar" (esto no crea ninguna Cita), "calendario" (no exponemos el calendario, solo el conteo), "check_availability" (nombre jubilado).

**Franja**:
Bloque horario del día del negocio en hora de Las Vegas. n8n devuelve por día las llaves `morning` (mañana, 8:00–12:00) y `afternoon` (tarde, 12:00–17:00). Al reservar, la **Cita** ocupa la franja completa: `start_date`/`end_date` de `create_order` son exactamente los límites de la franja elegida (ej. morning → `2026-06-29 08:00:00` a `2026-06-29 12:00:00`, hora local del negocio, sin `Z`).
_Avoid_: "horario" (a secas), "turno", "08-12"/"12-17" (llaves del contrato viejo).

**Cupo**:
Una unidad de Disponibilidad dentro de una Franja. El número que devuelve n8n (`4`) es **cuántos Cupos quedan libres**; `0` o Franja ausente = sin Disponibilidad en esa Franja. El Asistente nunca inventa Cupos: si la respuesta viene vacía, dice que no hay Disponibilidad.
_Avoid_: "slot" en el lenguaje de cara al visitante, "espacio".

**Orden (Order)**:
La reserva de una **Cita**: el Asistente la crea llamando la tool `create_order` (webhook n8n lori). Exige TODOS los datos del cliente (name, last_name, email, phone, address, city, zipcode, notes con la descripción del servicio), un día + **Franja** con **Cupos** > 0 verificados vía `get_availability`, y la confirmación explícita del visitante sobre el resumen. Éxito = HTTP 200 (el body de la respuesta no se interpreta). **Nunca se auto-reintenta**: en fallo (non-200 o timeout) el Asistente informa y solo reintenta si el visitante lo pide.
_Avoid_: "pedido"/"compra" (no es e-commerce), "booking" en texto de cara al visitante.

**Historial de Cliente (Customer History)**:
Registro de si un teléfono ya es cliente nuestro (nos compró o tuvo un servicio). El **Asistente** lo consulta (no lo calcula) llamando la tool `get_customer_history` contra un webhook de n8n (lori, `text-history`), enviando el teléfono como **dígitos nacionales** (ej. `2028829482`, sin `+1` ni símbolos). Se consulta UNA vez durante la reserva, en cuanto se obtiene el teléfono del visitante, ANTES de pedir el resto de datos de contacto. Si hay match (`found=true`) el Asistente saluda al cliente por su nombre y ofrece atender en la **misma dirección de archivo** (`work_orders[].location`), confirmando datos conocidos en vez de re-pedirlos; si no hay datos (`found=false`) es cliente nuevo y sigue el flujo normal. Solo lee — **no agenda ni crea** nada.
_Avoid_: "CRM"/"lookup" (a secas), "cliente frecuente" (describimos el match de la tool, no un programa de lealtad), "text-history" en lenguaje de cara al visitante.

**Eval**:
Prueba automatizada de una conversación completa contra el **Asistente**, corrida con promptfoo vía un **Provider de Evals** (ver ADR-0007). Califica en dos capas: aserciones deterministas (tools llamadas, payloads, ausencia de inventos) + **Juez LLM**. Corre local y manual (`npm run eval`); prueba el `DEFAULT_SYSTEM_PROMPT` del código, no la **Active Version**.
_Avoid_: "test unitario" (no prueba funciones, prueba pláticas), "probar las pláticas" (a secas, cuando importa distinguir guionado vs simulado).

**Provider de Evals**:
Wrapper JS/TS que promptfoo usa para invocar al **Asistente**: llama `streamText` directamente con `chatModel` + `buildSystemPrompt` + las tools, alimentando el historial multi-turn completo. NO pasa por `/api/chat` ni por la DB. En evals, `get_availability` pega al n8n real (solo-lectura) y `create_order` SIEMPRE es mock (su default de producción crearía **Órdenes** reales).
_Avoid_: "el endpoint de test" (no hay endpoint), "mock del agente" (el modelo es real; lo mockeado es la escritura).

**Escenario Guionado**:
Eval multi-turn donde los mensajes del visitante están escritos a mano (en inglés, con fechas relativas tipo "tomorrow"). Primera tanda: reserva completa, preguntas de precio, sin disponibilidad/fallos de webhook, datos incompletos, y el **Curioso**.
_Avoid_: "conversación grabada" (no es replay de producción; es guion).

**Cliente Simulado**:
LLM que juega al visitante con una persona y objetivo, conversando N turnos contra el **Asistente**. Personas v1: decidido, vago/indeciso, regateador de precios. Más cobertura de variación real que el guion, a cambio de costo y reproducibilidad.
_Avoid_: "usuario real", "bot de carga".

**Curioso**:
Persona/escenario del visitante que pregunta precios, servicios y horarios pero **nunca reserva**. El Asistente debe responder útil sin presionar y sin disparar `create_order`; el Booking Intent Gate debe mantenerse cerrado.
_Avoid_: "lead frío" (no calificamos leads; describimos comportamiento en la plática).

**Juez LLM**:
Modelo que califica una conversación contra una rúbrica (`llm-rubric` de promptfoo): tono profesional, apego a las etapas del flujo, no inventar precios ni **Cupos**. Complementa (no reemplaza) las aserciones deterministas.
_Avoid_: "el juez decide si pasa el build" (no hay CI; es señal para humanos).

**Registro de Tool (Tool Log)**:
El par de burbujas persistidas que documentan cada ejecución de tool: una para la **llamada** (hover/tap muestra el request body) y otra para el **resultado** (hover/tap muestra el response body o status). Se guardan en la DB junto a los mensajes del hilo y sobreviven recargas. Solo se renderizan en superficies internas (Playground y detalle de Conversaciones); el visitante del widget nunca las ve, aunque sus conversaciones también las generan.
_Avoid_: "log del sistema" (no es un log técnico aparte; vive en el hilo), "trace".

## Relationships

- El **System Prompt** gobierna al **Asistente** con el que conversa el público anónimo.
- La **Disponibilidad** se consulta con `get_availability`; una **Orden** se crea con `create_order`; consultar nunca reserva y reservar exige haber consultado.
- Cada ejecución de tool produce un **Registro de Tool** (llamada + resultado) en el hilo de la **Conversation**, sin importar el **Source**.
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
- "get_availability vs check_availability" se aclaró (2026-07-03): NO conviven — `get_availability` (lori-n8n, rango `dateStart`/`dateEnd`, franjas `morning`/`afternoon`) **reemplaza** a `check_availability` (jumpers-n8n, mock, un `date` con `Z`), que se elimina. Resuelto.
- "quede registro de la llamada" se acotó: registro **persistente en DB** (no solo burbujas en vivo del stream); visible en Playground y detalle de Conversaciones, oculto en el widget. Resuelto.
- "los formatos de fecha" se fijaron: `get_availability` usa `YYYY-MM-DD`; `create_order` usa `YYYY-MM-DD HH:mm:ss` **en hora local del negocio (Las Vegas), sin sufijo `Z`** — el contrato ISO-con-`Z` del tool viejo queda jubilado. Resuelto.
- "probar las pláticas" se acotó (2026-07-15): **Evals** de conversación con promptfoo — Escenarios Guionados + Cliente Simulado + aserciones de tools, calificados con aserciones + Juez LLM, local/manual, contra el prompt del código. NO incluye red team ni pruebas del endpoint HTTP (ver ADR-0007). Resuelto.
- **Inconsistencia detectada (2026-07-15, abierta)**: el System Prompt menciona tools de contacto (`contact_expert`) que NO están registradas en `route.ts` — el Asistente podría prometer una acción que no puede ejecutar. Mientras se resuelve, las Evals asercionan que no las prometa.
- "que no tenga que volver a llamar la tool" se resolvió (2026-07-03) **revirtiendo parcialmente** la exclusión de tools del contexto: el modelo ahora recibe las **últimas 25 filas** del hilo (texto + **Registro de Tool** re-inyectado como mensajes de tool reales), y así lee la Disponibilidad ya consultada desde el historial. La ventana ±4 días alimenta ese cache conversacional. Ver ADR-0006. Resuelto.
