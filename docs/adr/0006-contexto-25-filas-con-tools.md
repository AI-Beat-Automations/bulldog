---
status: accepted
---

# Contexto del modelo: últimas 25 filas con Registro de Tool re-inyectado

El ADR-0005 dejó los mensajes de tool fuera del contexto del modelo ("su texto
ya resume los resultados"). En la práctica eso obliga al Asistente a re-llamar
`get_availability` en cada mensaje del visitante, porque olvida entre requests
lo que ya consultó. Lo revertimos parcialmente: el contexto que se manda al
modelo pasa de "todo el historial, solo texto" a **las últimas 25 filas del
hilo contando todo** (mensajes de texto Y Registro de Tool), con los pares
`tool_call`/`tool_result` reconstruidos como mensajes de tool reales del
protocolo. Así el modelo lee la Disponibilidad desde su historial y solo
re-consulta cuando las fechas caen fuera de lo ya visto.

Para alimentar ese cache conversacional, la regla de consulta cambia: un día
concreto ya no consulta `dateStart = dateEnd` sino una **ventana ±4 días**
alrededor del día preguntado (el servidor sigue recortando fechas pasadas y el
tope de 31 días).

Trade-off aceptado: la disponibilidad leída del historial puede estar
**vencida** (los cupos cambian mientras chatean). Por eso el guardrail de
`create_order` se endurece: SIEMPRE re-consultar `get_availability` para el
día/franja elegidos justo antes de ordenar, aunque el historial ya tuviera
datos.

## Considered Options

- **Cache de la última disponibilidad en el system prompt.** Más barato y
  acotado, pero especial-casea una tool y pierde el resto del registro;
  descartado a favor de re-inyectar el historial real, que el usuario pidió
  explícitamente como "25 mensajes de historial en la DB".
- **Ventana solo de texto (sin tools).** Es el estado anterior; no cumple el
  objetivo.

## Consequences

- Los pares call/result que queden **incompletos** al cortar la ventana (o por
  filas huérfanas) se descartan del contexto: los providers exigen pares
  completos.
- Conversaciones largas quedan truncadas a 25 filas — techo de costo por
  request; el modelo pierde memoria de lo más viejo.
- La consecuencia de ADR-0005 "loadHistory filtra tools para el modelo" queda
  **superseded** por este ADR (el filtro sigue aplicando solo al widget).
