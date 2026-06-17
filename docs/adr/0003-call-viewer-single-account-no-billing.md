---
status: accepted
---

# Call Viewer: cuenta única, sin billing y "Call cost" público

bulldog suma una funcionalidad **"Call Viewer"**: ingiere los webhooks
`call_ended` de **Retell** y muestra un **listado + detalle** de llamadas
(transcript, audio y costo). Se construye como una feature **dentro de bulldog**
—no un repo aparte— portando el código del repo `call-system` ~1:1 y dejando
fuera todo lo relacionado con billing.

La decisión central es operar en **cuenta única**: sin multi-tenancy, sin tabla
`companies`, sin separación por cliente. Toda persona autenticada ve **todas**
las llamadas. Como consecuencia, el campo que Retell reporta como `retell_cost`
deja de ser el **margen secreto** que era en `call-system` (donde se ocultaba al
cliente y se facturaba con markup): aquí se vuelve un dato **público** expuesto
como **"Call cost"**, visible para cualquier usuario autenticado.

La **autenticación la provee el host** (el login existente de bulldog,
`auth()` de `@/lib/auth`); no se reimplementa ni se agregan roles. Cada página
revalida la sesión igual que el resto del Admin
(`const session = await auth(); if (!session) redirect("/login")`).

## Considered Options

- **Repo/servicio aparte (puerto de `call-system` tal cual).** Mantendría
  multi-tenancy y billing, pero arrastra complejidad (companies, márgenes,
  facturación) que el alcance de cuenta única no necesita. Descartada.
- **Conservar `retell_cost` como margen oculto.** Replicaría la lógica de
  billing de `call-system` sin que haya facturación. Costo sin beneficio.
  Descartada: el costo se expone como "Call cost".
- **Reimplementar auth/roles propios del Call Viewer.** Duplicaría el login y
  los permisos. Descartada: se reusa el `auth()` de bulldog, sin roles.

## Consequences

- **El "Call cost" es visible para todos los autenticados.** Aceptable porque no
  hay clientes externos en la cuenta: no hay margen que proteger.
- El esquema de datos se simplifica: **sin `companies`** ni columnas de tenant;
  una sola cuenta lógica. Menos joins, menos lógica de aislamiento.
- Al portar desde `call-system` hay que **eliminar** explícitamente el código de
  billing/markup y las referencias a multi-tenancy; el riesgo es dejar restos.
- Esta feature se entrega **apilada en PRs**: este PR es **fundación**
  (entrada de nav "Calls", página placeholder y este ADR). El esquema en DB, el
  webhook de ingesta y el listado/detalle reales llegan en PRs posteriores.
- La seguridad depende del login del host: si el Admin de bulldog es accesible,
  el Call Viewer también lo es. No hay capa de permisos adicional.
