---
status: accepted
---

# Booking real vía lori-n8n: `get_availability` reemplaza a `check_availability` y nace `create_order`

El asistente pasa de solo-lectura a poder **agendar**. La tool `check_availability`
(jumpers-n8n, mock estático, un solo `date` ISO con `Z`, franjas `08-12`/`12-17`)
se **elimina** y la reemplaza `get_availability` contra el n8n real de lori
(`/webhook/text-availability`), con contrato por rango (`dateStart`/`dateEnd` en
`YYYY-MM-DD`) y franjas `morning`/`afternoon` por día. Se agrega `create_order`
(`/webhook/text-create-order`): la cita ocupa la franja completa
(`start_date`/`end_date` = límites de la franja, `YYYY-MM-DD HH:mm:ss` en hora de
Las Vegas, sin `Z`) y el éxito se juzga solo por HTTP 200 — el body no se interpreta.

Decisiones que un lector futuro no debe "arreglar":

- **No conviven dos tools de disponibilidad.** Se consideró mantener ambas;
  descartado porque dos contratos distintos para el mismo concepto confunden al
  modelo y el viejo era un mock.
- **`create_order` nunca se auto-reintenta.** En timeout el desenlace es
  desconocido y reintentar puede **duplicar la cita** en n8n (el webhook no es
  idempotente). En non-200 tampoco: el asistente informa y solo reintenta si el
  visitante lo pide.
- **Guardrails a nivel prompt, no código:** antes de `create_order` el asistente
  debe (1) haber visto cupos > 0 en la franja vía `get_availability`, (2) tener
  los 9 campos del cliente completos y (3) confirmar el resumen con el visitante.
  El servidor solo aplica clamps mecánicos al rango (máx. 31 días, sin fechas
  invertidas); rango vago → hoy +14 días.

## Consequences

- El PRD (§ "Acciones / N8N: out of scope") queda superado: existe write path.
- `AVAILABILITY_WEBHOOK_URL` cambia de default (lori-n8n) y aparece la env del
  webhook de órdenes; el host jumpers-n8n desaparece del código.
- Las reglas de resolución de fecha ISO-`Z` del system prompt se reescriben al
  formato local sin `Z`.
