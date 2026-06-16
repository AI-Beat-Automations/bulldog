---
status: accepted
---

# Playground interno reintroducido y discriminador `source` en las conversaciones

El PRD (§14) había declarado que el "Chat Playground" de Eva **desaparece** y que
el **Admin solo lee** conversaciones. Lo revertimos: agregamos un **Playground**
(tercer ítem del nav, entre Conversaciones y Configuración) donde el Admin se hace
pasar por un visitante y chatea con el Asistente para validar la **Active Version**
del System Prompt antes/después de cambios. El invariante "Admin read-only" queda
acotado al listado de Conversaciones; dentro del Playground el Admin escribe
mensajes `user`.

Como esas pruebas se persisten en las **mismas** tablas que el tráfico real del
widget, agregamos una columna `source` (`widget` | `playground`) a
`chat_conversations` para poder distinguirlas (badge + filtro en el listado) sin
mezclarlas a ciegas. La marca la **provee el cliente** en el body de `POST /api/chat`
(no se deriva de la sesión), y se reusa el endpoint **público** existente en vez de
crear una ruta autenticada dedicada.

## Considered Options

- **Marca derivada del servidor (`auth()` en el handler) + ruta dedicada.**
  Infalsificable y sin rate-limit para el Admin. Descartada por ahora a favor de la
  simplicidad: una sola ruta, sin lógica de sesión en el path de chat. Es el
  **upgrade conocido** si la confiabilidad del listado pasa a importar.
- **Mezclar pruebas y tráfico real sin columna.** Cero migración, pero contamina el
  historial de clientes de forma irreversible (sin marca no se pueden separar
  retroactivamente). Descartada.
- **No persistir el Playground / store efímero.** Contradice el requisito explícito
  de que las pruebas queden en el historial. Descartada.

## Consequences

- **La marca `source` es falsificable**: el nombre del campo viaja en el JS público
  del widget, así que un caller externo puede mandar `source=playground`. Es un
  problema de **calidad de datos** (no de seguridad: nadie accede a datos ajenos).
  Riesgo aceptado en v1.
- El tráfico de prueba del Admin cuenta contra el **rate-limit por IP** (20/10min);
  testing intensivo puede toparse un 429.
- Migración **no destructiva**: `source` con default `'widget'`, las filas
  existentes quedan como widget.
- `resolveConversation`/`createConversation` (`lib/chat/persistence.ts`) y el handler
  `app/api/chat/route.ts` deben propagar `source`; el listado `/admin` deja de ser
  "solo widget" (badge por fila + filtro, todo visible por defecto).
- El ID de conversación lo sigue generando el backend (ADR-003 del PRD): "Nueva
  conversación" en el Playground solo abandona el hilo en pantalla (queda guardado)
  y el nuevo ID nace en el primer mensaje.
