# Stack detection cues

Read this only when the stack isn't obvious from `package.json` / dirs. Map what
you find to the four report sections (DB · API · UI · auth/jobs/integrations).

## Web framework / routing
| Signal | Stack | Where routes/pages live |
|---|---|---|
| `next` dep, `app/` dir | Next.js App Router | `app/**/page.tsx` (pages), `app/**/route.ts` (API), `proxy.ts`/`middleware.ts` (middleware) |
| `next` dep, `pages/` dir | Next.js Pages Router | `pages/**`, `pages/api/**` |
| `@remix-run/*` / `react-router` `routes/` | Remix / RR | `app/routes/**` |
| `@sveltejs/kit` | SvelteKit | `src/routes/**` (`+page`, `+server`) |
| `nuxt` | Nuxt | `pages/**`, `server/api/**` |
| `express`/`fastify`/`koa`/`hono`/`@nestjs` | Node API | route registrations, controllers, `@Get/@Post` decorators |
| `fastapi`/`flask`/`django` | Python | routers/`urls.py`/decorators; templates or DRF |
| `gin`/`echo`/`chi`/`fiber` | Go | router setup, handler funcs |
| `rails` | Rails | `config/routes.rb`, `app/controllers`, `app/views` |
| `laravel` | Laravel | `routes/*.php`, `app/Http/Controllers` |

## ORM / database
| Signal | ORM | Schema / migrations |
|---|---|---|
| `drizzle-orm` | Drizzle | schema in `**/schema.ts` (often `lib/db` / `db/`), SQL migrations in `drizzle/` or `migrations/`; `drizzle.config.ts` |
| `prisma` / `schema.prisma` | Prisma | `prisma/schema.prisma`, `prisma/migrations/` — read the schema directly |
| `typeorm` | TypeORM | `@Entity` classes, `migrations/` |
| `sequelize` / `mongoose` | Sequelize / Mongoose | model files |
| `sqlalchemy` / `alembic` | SQLAlchemy | model classes, `alembic/versions/` |
| Django ORM | Django | `models.py`, `migrations/` |
| `gorm` | GORM | structs with `gorm:` tags |
| `*.sql`, `knex`, raw `pg`/`mysql2` | raw SQL | migration/seed SQL files, query strings |

For the ER diagram: derive relationships from FK columns, `references()`,
`@relation`, `ForeignKey`, association tables, or `belongsTo`/`hasMany`.

## Auth
- `next-auth`/`@auth/*`, `lucia`, `@clerk/*`, `passport`, `devise`, `django.contrib.auth`,
  custom JWT (`jsonwebtoken`, `jose`). Note session strategy (JWT vs DB session),
  where the config lives, and how roles are stored/checked.
- Roles: look for an enum/column like `role`, `is_admin`, permission tables,
  guard middleware, or `inArray(role, [...])`-style checks.

## Jobs / background work
- Cron: `vercel.json` crons, `node-cron`, GitHub Actions schedules, `*/cron*` routes,
  Celery beat, Sidekiq, `cron` tables.
- Queues/workers: BullMQ, Inngest, Trigger.dev, SQS, Celery, Sidekiq, Resque.
- One-off scripts: a `scripts/` dir, custom `package.json` scripts.

## External integrations
- Third-party SDK deps: payments (`stripe`), comms/voice (`twilio`, `retell-sdk`),
  email (`resend`, `nodemailer`, `sendgrid`), storage (`@aws-sdk/*`, `@supabase/*`),
  analytics, LLM (`@anthropic-ai/sdk`, `openai`). For each: what it's used for and
  the entry-point file.
- Env vars: read `.env.example` / `.env.sample` and `process.env.*` / `os.environ`
  usages. **List names + purpose only. Never read or print values from `.env`.**

## Quick commands (use the repo's actual layout)
- List API routes (Next App Router): `find app -name route.ts`
- Count pages: `find app -name 'page.tsx'`
- Migrations: `ls drizzle/ 2>/dev/null || ls prisma/migrations 2>/dev/null`
- Deps at a glance: read `package.json` `dependencies`.

