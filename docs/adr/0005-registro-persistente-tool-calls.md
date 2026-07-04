---
status: accepted
---

# Registro de Tool persistente en el hilo, visible solo en superficies internas

Cada ejecución de tool (llamada y resultado, con request/response body) se
**persiste en la DB junto a los mensajes del hilo**, en vez de existir solo como
partes efímeras del stream. Se eligió así porque "que quede registro" exige
sobrevivir recargas y aparecer en el detalle de Conversaciones; la alternativa
sin migración (burbujas solo en vivo) se descartó porque el registro se perdía
al recargar.

El registro se genera para **todas** las conversaciones (widget y playground),
pero solo se **renderiza** en superficies internas (Playground y detalle de
Conversaciones): el request body contiene datos personales del visitante
(email, teléfono, dirección) y mecánica interna que el widget público no debe
exponer. El detalle se ve con hover en desktop y tap en mobile.

## Consequences

- Migración a `chat_messages`: los roles dejan de ser solo `user`/`assistant` y
  el contenido deja de ser solo texto (payload JSON de la tool).
- `loadHistory` debe filtrar los mensajes de tool al reconstruir el historial
  que se manda al modelo y al render del widget. **Nota:** la parte "al modelo"
  quedó superseded por ADR-0006 (el contexto del modelo re-inyecta el Registro
  de Tool en una ventana de 25 filas); el filtro sigue vigente para el widget.
- **Riesgo aceptado (v1)**: el AI SDK (`toUIMessageStreamResponse`) no permite
  suprimir tool parts del wire — viajan también al cliente del widget aunque no
  se rendericen (visibles con devtools). Impacto acotado: el visitante solo
  vería sus propios datos y la mecánica interna. Upgrade conocido: filtrar las
  partes del stream server-side según `source`.
