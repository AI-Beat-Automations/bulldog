---
status: accepted
---

# Evals de conversación con promptfoo: provider custom sobre el SDK, `get_availability` real y `create_order` siempre mockeada

Se introduce una suite de **Evals** con promptfoo (primera infraestructura de
pruebas del repo) para probar las conversaciones del **Asistente** de reservas.
La suite NO le pega a `POST /api/chat`: usa un **provider custom** en JS/TS que
invoca `streamText` directamente con `chatModel` (`lib/ai.ts`),
`buildSystemPrompt(DEFAULT_SYSTEM_PROMPT)` (`lib/chat/system.ts`) y las dos
tools reales. Así cada caso alimenta un historial multi-turn completo sin
necesitar Postgres, CORS, rate-limit ni encadenar `conversationId`.

Composición de la suite (decidida 2026-07-15):

- **Escenarios Guionados** en inglés (el tráfico real del widget): reserva
  completa (happy path), preguntas de precio contra la tabla del prompt, sin
  disponibilidad / webhook caído / orden `rejected` / `unknown_outcome`,
  datos incompletos o inválidos, y el **Curioso** (pregunta todo, no reserva
  nada — el Asistente no debe presionar ni disparar tools de escritura).
- **Cliente Simulado** (LLM jugando al visitante) con tres personas: decidido,
  vago/indeciso (valida el Booking Intent Gate) y regateador de precios
  (valida que no se inventan cifras ni descuentos).
- **Aserciones de tools**: `get_availability` antes de ofrecer horarios;
  payload de `create_order` con los 10 campos completos y fechas
  `YYYY-MM-DD HH:mm:ss` sin `Z`; jamás invocar/prometer tools inexistentes.
- **Calificación en dos capas**: aserciones deterministas para lo verificable
  + **Juez LLM** (`llm-rubric`) para tono profesional y apego a las etapas
  del flujo.

Decisiones que un lector futuro no debe "arreglar":

- **`create_order` SIEMPRE se mockea en evals.** El default de
  `ORDER_WEBHOOK_URL` apunta al webhook de **producción** de lori-n8n; una
  suite que lo llame crea Órdenes reales (y el flujo puede notificar gente).
  `get_availability` sí va contra el n8n real: es solo-lectura y sin riesgo.
- **Se prueba el `DEFAULT_SYSTEM_PROMPT` del código, no la Active Version de
  la DB.** El objetivo es una red de regresión reproducible y versionada en
  git. Consecuencia asumida: ediciones del Admin vía panel quedan fuera de la
  red (evaluar versiones antes de activarlas sería otra herramienta, otro ADR).
- **No se prueba contra `/api/chat`.** Se consideró (fidelidad total) y se
  descartó: exige DB real, Origin permitido, parsear el stream UI-message y
  lidiar con Upstash; eso es plomería HTTP, no comportamiento conversacional.
- **Fechas relativas en los guiones** ("tomorrow", "next Tuesday"), nunca
  fechas fijas: la disponibilidad real cambia a diario y el system prompt
  inyecta la fecha actual de Las Vegas. Las aserciones verifican
  comportamiento (consultó, ofreció franjas, rango válido), no cifras exactas.
- **Corre local y manual** (`npm run eval`), sin CI: cada corrida gasta tokens
  reales de OpenRouter (agente + cliente simulado + juez). CI/nightly es un
  upgrade conocido, no un olvido.
- **Sin red team en v1.** Se ofreció y se descartó explícitamente; agregarlo
  después es sumar un modo de promptfoo, no rehacer la suite.

## Consequences

- Nace `evals/` con `promptfooconfig.yaml`, el provider custom, los guiones y
  personas; `promptfoo` entra como dependencia dev y `npm run eval` al
  `package.json`.
- Cambiar `DEFAULT_SYSTEM_PROMPT` o las tools ahora tiene red de seguridad;
  cambiar la Active Version en el panel sigue sin ella (aceptado).
- El mock de `create_order` habilita probar los tres desenlaces del contrato
  (2xx, `rejected`, `unknown_outcome`) sin tocar n8n — incluido que el
  Asistente jamás afirme que una Orden existe tras un `unknown_outcome`.
- Pendiente detectado durante el diseño: el prompt menciona tools de contacto
  (`contact_expert`) que NO están registradas en `route.ts`; la suite debe
  asercionar que el Asistente no las prometa hasta que se resuelva esa
  inconsistencia.
