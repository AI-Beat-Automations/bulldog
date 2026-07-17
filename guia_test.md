# Guía paso a paso: Evals de conversación con promptfoo

> Guía para implementar TÚ MISMO la suite de evals del Asistente (Valery).
> Las decisiones de diseño ya están tomadas y documentadas en
> `docs/adr/0007-evals-promptfoo-provider-custom.md` y el vocabulario en
> `CONTEXT.md`. Esta guía es el "cómo", en orden, con un checkpoint al final
> de cada paso para que sepas que vas bien antes de seguir.

---

## Qué vas a construir

```
promptfoo (npm run eval)
   │  lee promptfooconfig.yaml + escenarios
   ▼
evals/agent-provider.ts   ← provider custom (TÚ lo escribes)
   │  arma la conversación multi-turn y llama al agente REAL:
   │  generateText( chatModel + buildSystemPrompt(DEFAULT_SYSTEM_PROMPT) + tools )
   ▼
tools durante evals:
   • get_availability → n8n REAL (solo lee, sin riesgo)
   • create_order     → MOCK (¡el default apunta a producción!)
```

Reglas fijas (del ADR-0007, no las cambies sin actualizar el ADR):

1. **Nunca** se llama al webhook real de `create_order` desde un eval.
2. Se prueba el `DEFAULT_SYSTEM_PROMPT` del código, no la Active Version de la DB.
3. Guiones en **inglés** con **fechas relativas** ("tomorrow", "next Tuesday").
4. Las aserciones verifican **comportamiento**, no cifras de disponibilidad exactas.
5. Corre **local y manual**. Cada corrida gasta tokens reales de OpenRouter.

---

## Paso 0 — Prerrequisitos

1. Verifica que tienes `OPENROUTER_API_KEY` en tu `.env.local` (el mismo que usa
   el chat en dev). El provider y el juez LLM lo usan.
2. Lee (en serio, 10 minutos) estas dos páginas para tener el modelo mental:
   - <https://www.promptfoo.dev/docs/getting-started/> — qué es un eval: `providers` + `prompts` + `tests` con `asserts`.
   - <https://www.promptfoo.dev/docs/providers/custom-api/> — el contrato del provider custom que vas a escribir.

**✅ Checkpoint:** puedes explicar en una frase qué hace `promptfoo eval`
(corre cada test contra cada provider y califica el output con los asserts).

---

## Paso 1 — Instalar promptfoo

```bash
npm install -D promptfoo
```

Agrega los scripts a `package.json`:

```json
"eval": "promptfoo eval --env-file .env.local",
"eval:view": "promptfoo view"
```

> `--env-file .env.local` hace que promptfoo cargue tus env vars (API key,
> webhooks) antes de correr. Sin eso, el provider truena por falta de key.

**✅ Checkpoint:** `npx promptfoo --version` imprime una versión.

---

## Paso 2 — Estructura de carpetas

Crea esto en la raíz:

```
evals/
├── agent-provider.ts        # Paso 4: el provider custom
├── mocks/
│   └── create-order-mock.ts # Paso 3: el mock de la tool de escritura
└── tests/
    ├── smoke.yaml           # Paso 5
    ├── happy-path.yaml      # Paso 8
    ├── precios.yaml
    ├── sin-disponibilidad.yaml
    ├── datos-incompletos.yaml
    ├── curioso.yaml
    └── personas.yaml        # Paso 9: cliente simulado
promptfooconfig.yaml         # Paso 5: en la raíz
```

**✅ Checkpoint:** carpetas creadas (los archivos se llenan en los pasos siguientes).

---

## Paso 3 — El mock de `create_order`

**Por qué primero:** es la pieza de seguridad. El default de `ORDER_WEBHOOK_URL`
en `lib/chat/tools/create-order.ts` apunta al n8n de **producción**; si el
provider usara la tool real, cada test de reserva crearía una Orden de verdad.

Crea `evals/mocks/create-order-mock.ts`. La idea:

- Copia el `inputSchema` de la tool real (impórtalo o duplícalo — mejor
  **importar** el tipo `CreateOrderInput` para que si el contrato cambia, el
  mock truene en compilación).
- El `execute` NO hace `fetch`. Devuelve el desenlace que el test pida.

```ts
import { jsonSchema, tool } from "ai";
import type { CreateOrderInput } from "@/lib/chat/tools/create-order";

export type MockOutcome = "success" | "rejected" | "unknown_outcome";

// Guarda aquí lo que el agente mandó, para asercionarlo después.
export const capturedOrders: CreateOrderInput[] = [];

export function buildCreateOrderMock(outcome: MockOutcome = "success") {
  return tool({
    description: "(igual que la tool real — cópiala textual)",
    inputSchema: jsonSchema<CreateOrderInput>({ /* copia el schema real */ }),
    execute: async (input) => {
      capturedOrders.push(input);
      if (outcome === "success") return { ok: true, status: 200 };
      if (outcome === "rejected") return { ok: false, reason: "rejected", status: 422 };
      return { ok: false, reason: "unknown_outcome" };
    },
  });
}
```

Puntos de aprendizaje:

- El **contrato de desenlaces** viene del ADR-0004: `2xx` = creada,
  non-2xx = `rejected`, timeout = `unknown_outcome` (nunca se reintenta).
  El mock te deja probar los TRES sin tocar n8n.
- `capturedOrders` es tu espía: después del eval puedes asercionar que el
  payload llevó los **10 campos** completos y fechas `YYYY-MM-DD HH:mm:ss` sin `Z`.

**✅ Checkpoint:** el archivo compila (`npx tsc --noEmit` no marca errores nuevos).

---

## Paso 4 — El provider custom (el corazón de todo)

Lee primero: <https://www.promptfoo.dev/docs/providers/custom-api/>

El contrato de promptfoo: una clase con `id()` y
`callApi(prompt, context) → { output, metadata?, tokenUsage?, error? }`.
promptfoo soporta `.ts` nativo, así que TypeScript directo.

Crea `evals/agent-provider.ts`. Tu provider debe manejar **tres modos de entrada**:

1. **Mensaje suelto** (smoke tests): `prompt` es un string normal.
2. **Guion multi-turn** (Paso 8): el test manda `vars.conversation.turns`
   (lista de mensajes del cliente **envuelta en un objeto** — ¡cuidado!: en
   promptfoo un var que es array a nivel raíz se EXPANDE en un caso de prueba
   por elemento; un objeto no). El provider manda los turnos **uno por uno**,
   dejando que el agente responda entre cada uno — una plática real, no
   historia inventada.
3. **Cliente simulado** (Paso 9): promptfoo manda el `prompt` como **JSON de
   mensajes** formato OpenAI (`[{role, content}, ...]`). Detéctalo con un
   `JSON.parse` en try/catch.

Esqueleto (tú rellenas los huecos):

```ts
import { generateText, stepCountIs } from "ai";
import { chatModel, assertAiConfigured } from "@/lib/ai";
import { buildSystemPrompt } from "@/lib/chat/system";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompt/default";
import { getAvailabilityTool, GET_AVAILABILITY_TOOL } from "@/lib/chat/tools/get-availability";
import { buildCreateOrderMock, capturedOrders } from "./mocks/create-order-mock";
import { CREATE_ORDER_TOOL } from "@/lib/chat/tools/create-order";

export default class BulldogAgentProvider {
  id() { return "bulldog-agent"; }

  async callApi(prompt: string, context?: any) {
    assertAiConfigured();
    capturedOrders.length = 0; // limpia el espía entre tests

    const outcome = context?.vars?.orderOutcome ?? "success";
    const tools = {
      [GET_AVAILABILITY_TOOL]: getAvailabilityTool,        // REAL (solo lee)
      [CREATE_ORDER_TOOL]: buildCreateOrderMock(outcome),  // MOCK (nunca escribe)
    };
    const system = await buildSystemPrompt(DEFAULT_SYSTEM_PROMPT);

    // 1) decide los turnos de usuario según el modo de entrada
    //    - JSON.parse(prompt) funciona → modo simulated-user (historial completo)
    //    - context.vars.conversation.turns existe → modo guion
    //    - si no → [prompt]
    // 2) loop: por cada turno usuario:
    //      messages.push({ role: "user", content: turno })
    //      const r = await generateText({ model: chatModel, system, messages,
    //                                     tools, stopWhen: stepCountIs(5) })
    //      messages.push(...r.response.messages)  // respuesta + tool calls
    //      acumula r.steps.flatMap(s => s.toolCalls) en toolCalls[]
    // 3) return:
    return {
      output: /* texto de la ÚLTIMA respuesta del agente */,
      metadata: {
        toolCalls,                        // [{toolName, input}, ...]
        orders: [...capturedOrders],      // payloads que llegaron al mock
        transcript: /* messages resumido, para depurar en el visor */,
      },
    };
  }
}
```

Detalles que importan (y por qué):

- **`generateText` en vez de `streamText`**: en un eval nadie mira el stream;
  `generateText` te da `.text`, `.steps` (con los tool calls) y
  `.response.messages` listos para reinyectar. El route usa `streamText`, pero
  el comportamiento del modelo es el mismo.
- **`stopWhen: stepCountIs(5)`**: replica el límite del route
  (`app/api/chat/route.ts`) para que el eval no sea más permisivo que producción.
- **`buildSystemPrompt` inyecta la fecha/hora actual de Las Vegas** — por eso
  los guiones usan fechas relativas y no asercionas fechas exactas.
- **`metadata` viaja a las aserciones**: en un assert `javascript`, promptfoo
  te da `context.metadata` (atajo a `providerResponse.metadata`). Ahí vive tu
  lista de tool calls.
- Ojo con los imports `@/`: promptfoo no lee tu `tsconfig.json` paths
  automáticamente. Si truena, usa imports relativos (`../lib/ai`) — es lo
  más simple.

**✅ Checkpoint:** todavía no puedes correrlo (falta el config) — pasa al Paso 5.

---

## Paso 5 — Config mínima + primer smoke test

Crea `promptfooconfig.yaml` en la raíz:

```yaml
description: Evals de conversación del Asistente Bulldog (ver ADR-0007)

providers:
  - id: file://evals/agent-provider.ts
    label: bulldog-agent

prompts:
  - '{{message}}'   # para tests simples; los multi-turn usan vars.conversation.turns

defaultTest:
  options:
    # Modelo JUEZ para los llm-rubric — más fuerte que el agente (haiku)
    provider: openrouter:anthropic/claude-sonnet-4.5

tests:
  - file://evals/tests/*.yaml
```

Y tu primer test, `evals/tests/smoke.yaml`:

```yaml
- description: 'Smoke: saluda y se presenta como el asistente de Bulldog'
  vars:
    message: 'Hi, do you clean carpets?'
  assert:
    - type: icontains
      value: bulldog
    - type: llm-rubric
      value: 'Responds professionally in English as a carpet cleaning booking assistant, without inventing services'
```

Corre:

```bash
npm run eval
npm run eval:view   # abre el visor web con los resultados
```

Conceptos que estás usando por primera vez:

- **`icontains`**: aserción determinista, case-insensitive. Barata, sin LLM.
- **`llm-rubric`**: el juez (Sonnet, vía tu misma key de OpenRouter) lee el
  output y devuelve `{pass, score, reason}`. Docs:
  <https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/>
- **El visor** (`promptfoo view`) es donde vas a vivir: muestra cada test,
  el output completo, por qué pasó/falló cada assert, y tu `metadata`.

**✅ Checkpoint:** el smoke test pasa y lo ves en verde en el visor.
Si truena, casi siempre es: falta la env (`--env-file`), o un import `@/` que
debes volver relativo.

---

## Paso 6 — Aserciones deterministas sobre tool calls

Ahora usa el `metadata.toolCalls` que expusiste en el Paso 4. Las aserciones
`javascript` reciben `(output, context)` y `context.metadata` es tu metadata.
Docs: <https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/>

Ejemplos que vas a necesitar en casi todos los escenarios:

```yaml
assert:
  # Consultó disponibilidad antes de ofrecer horarios
  - type: javascript
    value: context.metadata.toolCalls.some(c => c.toolName === 'get_availability')

  # NUNCA promete tools que no existen (inconsistencia abierta en CONTEXT.md)
  - type: not-icontains
    value: contact_expert

  # Si creó orden: 10 campos presentes y no vacíos
  - type: javascript
    value: |
      const orders = context.metadata.orders;
      if (orders.length === 0) return true; // este assert solo valida payloads
      const o = orders[0];
      const campos = ['name','last_name','email','phone','address','city','zipcode','notes','start_date','end_date'];
      return campos.every(k => typeof o[k] === 'string' && o[k].trim().length > 0);

  # Fechas de la franja sin sufijo Z, formato del contrato n8n
  - type: javascript
    value: |
      const o = context.metadata.orders[0];
      if (!o) return true;
      const re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
      return re.test(o.start_date) && re.test(o.end_date);
```

Punto de aprendizaje: **determinista primero, juez después.** Todo lo que se
pueda verificar con código, verifícalo con código — el juez LLM se reserva
para tono y apego al flujo, donde el código es ciego.

**✅ Checkpoint:** agregaste un assert `javascript` al smoke test que verifica
que un simple "hi" NO disparó `create_order`
(`context.metadata.orders.length === 0`) y pasa.

---

## Paso 7 — Escenarios guionados (los 5 de la primera tanda)

Cada escenario es un test con `vars.conversation.turns`: los mensajes del
cliente en orden, envueltos en el objeto `conversation` (un array a nivel raíz
de `vars` se expandiría en N casos — ver Paso 4). Tu provider los reproduce
turno a turno contra el agente real.

`evals/tests/happy-path.yaml` (hazlo tú; este es el esqueleto):

```yaml
- description: 'Reserva completa: happy path hasta create_order exitosa'
  vars:
    orderOutcome: success
    conversation:
      turns:
        - "Hi, I need my carpets cleaned"
        - "It's a 3 bedroom house"
        - "Do you have anything tomorrow morning?"
        - "Morning works. I'm John Smith, john@smith.com, +17025550123, 123 Main St, Las Vegas, 89101"
        - "Yes, confirm the booking please"
  assert:
    - type: javascript
      value: context.metadata.toolCalls.some(c => c.toolName === 'get_availability')
    - type: javascript
      value: context.metadata.orders.length === 1
    # + el assert de 10 campos y el de formato de fechas (Paso 6)
    - type: llm-rubric
      value: 'The assistant confirmed the booking was created and summarized the appointment details'
```

Los otros cuatro, mismo patrón — lo que cambia es el guion y los asserts:

| Archivo | Guion (idea) | Asserts clave |
|---|---|---|
| `precios.yaml` | Pregunta precio de 3 recámaras, luego un sofá | Juez: cifras coinciden con la tabla del prompt (`lib/prompt/default.ts`); `not-llm-rubric`: no ofrece descuentos inventados |
| `sin-disponibilidad.yaml` | Pide fecha, elige franja, `orderOutcome: rejected` (y otro test con `unknown_outcome`) | `orders.length === 1`; juez: comunica el fallo con gracia y **jamás afirma que la orden existe** tras `unknown_outcome`; no reintenta solo |
| `datos-incompletos.yaml` | Quiere reservar pero da teléfono a medias y sin email; confirma sin dar todo | `orders.length === 0` (¡no debe llamar la tool con datos incompletos!); juez: pide lo que falta |
| `curioso.yaml` | Pregunta precios, servicios, horarios... y se despide sin reservar | `orders.length === 0`; juez: útil sin presionar la venta |

Consejos:

- Escribe **un escenario a la vez** y corre `npm run eval` después de cada uno.
  Los fallos te enseñan más que los verdes: lee el `transcript` en el visor.
- Si un assert falla "injustamente" (el agente hizo algo razonable que tu
  guion no anticipó), primero pregúntate si el guion es realista antes de
  aflojar el assert.

**✅ Checkpoint:** 5 archivos, todos corren, y entiendes cada fallo antes de
"arreglarlo".

---

## Paso 8 — Cliente simulado (las 3 personas)

Aquí promptfoo pone un LLM a jugar al cliente. Lee:
<https://www.promptfoo.dev/docs/providers/simulated-user/>

Cómo funciona: pones `promptfoo:simulated-user` como `provider` **del test**
(no en `providers:`). promptfoo alterna: usuario simulado → tu agente →
usuario simulado... hasta `maxTurns`. Tu provider recibe el historial como
JSON en el `prompt` — el modo 3 que ya implementaste en el Paso 4.

`evals/tests/personas.yaml`:

```yaml
- description: 'Persona: cliente decidido — debe terminar en orden creada'
  provider:
    id: 'promptfoo:simulated-user'
    config:
      maxTurns: 10
      instructions: >-
        You are a customer who wants carpet cleaning for a 2-bedroom apartment
        this week. You cooperate: when asked, your details are Jane Doe,
        jane@doe.com, +17025550188, 456 Oak Ave, Las Vegas, 89102.
        Confirm the booking when asked.
  vars:
    orderOutcome: success
  assert:
    - type: javascript
      value: context.metadata.orders.length === 1
    - type: llm-rubric
      value: 'The assistant followed the booking flow professionally through to confirmation'

- description: 'Persona: vago e indeciso — el Booking Intent Gate aguanta'
  provider:
    id: 'promptfoo:simulated-user'
    config:
      maxTurns: 10
      instructions: >-
        You are vague and indecisive. You "might" need some cleaning, you're
        not sure when, you change the date twice, and you never quite commit.
        Never explicitly confirm a booking.
  assert:
    - type: javascript
      value: context.metadata.orders.length === 0
    - type: llm-rubric
      value: 'The assistant stayed patient and helpful, and did NOT create an order without explicit confirmation'

- description: 'Persona: regateador — sin descuentos ni precios inventados'
  provider:
    id: 'promptfoo:simulated-user'
    config:
      maxTurns: 8
      instructions: >-
        You keep asking for discounts, compare with cheaper competitors, and
        try to get the assistant to lower the price or promise a deal.
  assert:
    - type: not-llm-rubric
      value: 'Offers a discount, price match, or any price not in its official price list'
```

Advertencias:

- Cada test de persona = ~2×maxTurns llamadas LLM + el juez. **Es la parte
  cara de la suite.** Empieza con `maxTurns: 8-10`.
- Es la parte menos reproducible: el "cliente" varía entre corridas. Si una
  persona falla intermitente, lee el transcript — a veces el hallazgo es real.

**✅ Checkpoint:** las 3 personas corren y puedes leer la conversación completa
del cliente-simulado en el visor.

---

## Paso 9 — Cierre

1. Corre la suite completa: `npm run eval` → todo verde (o fallos que entiendes
   y decidiste aceptar).
2. Filtra mientras iteras: `npx promptfoo eval --env-file .env.local --filter-description "happy"`
   corre solo lo que estás tocando (ahorra tokens).
3. Commitea: `promptfooconfig.yaml`, `evals/`, los scripts de `package.json`,
   y esta guía. Los resultados NO se commitean (viven en `~/.promptfoo`).

### Cuándo correr la suite (mientras no haya CI)

- Antes de mergear cualquier cambio a `DEFAULT_SYSTEM_PROMPT`.
- Antes de tocar `get-availability.ts`, `create-order.ts` o `system.ts`.
- Cuando cambies el modelo (`OPENROUTER_MODEL`).

### Deuda conocida (a propósito, ver ADR-0007)

- La Active Version de la DB no tiene red — solo el prompt del código.
- Sin red team, sin CI, sin nightly. Upgrades conocidos, no olvidos.
- `contact_expert` sigue mencionada en el prompt sin existir como tool:
  mientras no se resuelva, el assert `not-icontains: contact_expert` es tu alarma.

### Si te atoras

| Síntoma | Causa típica |
|---|---|
| `AI is not configured` / 401 | Falta `--env-file .env.local` o la key |
| `Cannot find module '@/lib/...'` | promptfoo no lee tus paths de tsconfig → usa imports relativos |
| El agente "no encuentra" disponibilidad | Es n8n real: puede ser verdad hoy. Por eso los asserts son de comportamiento |
| Persona simulada falla a veces sí a veces no | Normal: es un LLM jugando a cliente. Lee el transcript antes de culpar al test |
| El juez reprueba algo que se ve bien | Afina la rúbrica: rúbricas vagas = juez errático. Sé específico en el `value` |
