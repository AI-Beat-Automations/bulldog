---
name: arch-report
description: >-
  Scan the current repository and generate a single self-contained, navigable
  HTML architecture report (database schema + ER diagram, API endpoints, UI
  pages/components, and auth/roles/jobs/integrations). Use when the user wants a
  "mapa", "informe de arquitectura", "architecture report", "codebase overview",
  or a reference document to read before planning a new feature. Stack-agnostic:
  auto-detects the framework, ORM, and conventions in use.
---

# Architecture Report

Produce **`docs/architecture-report.html`** — one self-contained file the user
reads *before planning a new feature*. It must answer: where does data live, how
is it shaped, what endpoints exist, what the UI looks like, and how auth / jobs /
external services hang together.

Optimize for **fast and accurate**. Discover the repo, don't assume — heuristics
vary by stack. The HTML is built by filling an existing template, so you only
generate *content*, never CSS/JS.

## Process

### 1. Detect the stack (fast)
Read `package.json` / `pyproject.toml` / `go.mod` / `composer.json` / `Gemfile`,
the lockfile, and top-level dirs. Identify: language, web framework, ORM/DB
layer, auth lib, UI lib, and where migrations live. If unsure which stack,
open `reference.md` (next to this file) for per-stack detection cues. Do **not**
read `reference.md` if the stack is already obvious.

### 2. Gather content — fan out for speed
For anything but a tiny repo, launch **parallel `Explore` agents**, one per
section, so the main thread stays light. Give each agent the detected stack and
ask it to return *structured findings* (not file dumps):

- **Database** — every table/model: columns (name, type, nullable, default, PK/FK),
  enums, indexes, unique constraints, and relationships. Note the ORM and where
  the schema + migrations live. Capture enough to draw an ER diagram.
- **API / endpoints** — every route: HTTP method, path, auth requirement, a
  one-line purpose, and the **full request/response contract**: path params,
  query params, request-body fields (each: name · type · required), and a
  representative response shape (field names + types) plus notable status codes.
  Read the handler code — do not guess field names. Group by resource.
- **UI** — route/page tree, layouts, and the main reusable components with a
  one-line role each. Note the rendering model (RSC/SSR/SPA), styling system,
  and component library.
- **Auth, roles, jobs, integrations** — auth mechanism & session strategy, the
  role/permission model, middleware/guards, cron/queue/background jobs, external
  services (with the SDK/client used), and **env vars** (names + purpose only —
  **never values/secrets**).

Have agents cite `path:line` for key findings so the report is verifiable.

### 3. Build the HTML
1. Read `assets/template.html` (next to this file).
2. Replace the placeholders:
   - `{{TITLE}}` → e.g. `call-system — Architecture Report`
   - `{{REPO_NAME}}` → repo/dir name
   - `{{SUBTITLE}}` → one-line stack summary (e.g. *Next.js 16 · Drizzle ORM · Postgres · next-auth*)
   - `{{GENERATED_AT}}` → today's date (use the date from context; do not invent)
   - `{{CHIPS}}` → a few `<span class="chip">…</span>` quick-facts (e.g. `<span class="chip"><b>25</b> endpoints</span>`)
   - `<!-- CONTENT -->` → your section HTML (see below)
3. Write the result to `docs/architecture-report.html` (create `docs/` if absent).
   Overwrite if it already exists.
4. Sanity-check: confirm the file written contains your real content (not stray
   placeholders) and the section count looks right.

The template already provides the sidebar, auto-generated table of contents,
scroll-spy, search box, dark theme, table/badge styles, and Mermaid loading from
CDN. **Do not** add `<style>`/`<script>`/`<head>`; only emit the body content
that replaces `<!-- CONTENT -->`.

**Gold-standard example:** `assets/example-report.html` (next to this file) is a
full report produced by this skill. Match its structure, depth, and tone — in
particular the collapsible per-endpoint request/response format. Read it if you
need a concrete reference for any section.

## Content structure (what to emit for `<!-- CONTENT -->`)

Each top-level section MUST be wrapped so the TOC and search work:

```html
<section data-section>
  <h2>Database Schema</h2>
  ...content, <h3> subsections, tables, <details>, diagrams...
</section>
```

Recommended sections, in order:

1. **`<h2>Overview</h2>`** — 2–3 sentence purpose, the detected stack, key scripts
   (dev/build/test/migrate), and a compact folder map (`<pre>` tree of the
   meaningful top-level dirs with a one-line note each).
2. **`<h2>Database Schema</h2>`** — a Mermaid **`erDiagram`** first, then one
   collapsible `<details>` per table holding a columns table. Example shells:

   ```html
   <pre class="mermaid">
   erDiagram
     COMPANY ||--o{ CALL : has
     COMPANY ||--o{ USER : employs
     CALL { uuid id PK  text status  int duration_s }
   </pre>

   <details open><summary>company</summary><div class="body">
     <table><thead><tr><th>Column</th><th>Type</th><th>Null</th><th>Default</th><th>Notes</th></tr></thead>
     <tbody><tr><td><code>id</code></td><td>uuid</td><td>no</td><td>gen_random_uuid()</td><td>PK</td></tr></tbody></table>
   </div></details>
   ```
   Mermaid `erDiagram` rules: entity names should be simple identifiers; keep
   relationships to real FKs; if there are very many tables, diagram the core
   ones and list the rest.
3. **`<h2>API Endpoints</h2>`** — group by resource with `<h3>`. Render **each
   endpoint as a collapsible `<details class="endpoint">`** so the request /
   response detail only shows on click. The `<summary>` is the at-a-glance row;
   the `<div class="body">` holds the contract. Use method badges
   (`m-get m-post m-put m-patch m-delete`) and auth tags
   (`<span class="tag ok">public</span>` / `<span class="tag warn">auth</span>` /
   `<span class="tag danger">root</span>`). Endpoint shell:

   ```html
   <details class="endpoint">
     <summary>
       <span class="badge m-get">GET</span><code>/api/calls</code>
       <span class="tag warn">auth</span>
       <span class="sum-note">Paginated calls list, scoped by role</span>
     </summary>
     <div class="body">
       <h4>Path params</h4>
       <table><thead><tr><th>Param</th><th>Type</th><th>Notes</th></tr></thead>
         <tbody><tr><td><code>id</code></td><td>string</td><td>call id</td></tr></tbody></table>
       <h4>Query params</h4>
       <table><thead><tr><th>Param</th><th>Type</th><th>Req</th><th>Notes</th></tr></thead>
         <tbody><tr><td><code>page</code></td><td>number</td><td>no</td><td>default 1</td></tr></tbody></table>
       <h4>Request body</h4>
       <table><thead><tr><th>Field</th><th>Type</th><th>Req</th><th>Notes</th></tr></thead>
         <tbody><tr><td><code>action</code></td><td>"void"|"restore"</td><td>yes</td><td></td></tr></tbody></table>
       <h4>Response</h4>
       <pre><code>{ data: [{ id: string, callStatus: string }], total: number, page: number }</code></pre>
       <p>Status: <code>200</code> · <code>403</code> staff · <code>409</code> on race.</p>
     </div>
   </details>
   ```
   Omit a sub-section (`Path params` / `Query params` / `Request body`) when that
   endpoint has none — don't emit empty tables. For read-only `GET`s, skip
   `Request body`. Keep the `<summary>` to one scannable line; put everything
   else in the body.
4. **`<h2>UI</h2>`** — a `<pre>` route/page tree, then a table of the main
   components (Component · Location · Role). Optionally a Mermaid `flowchart`/
   `graph` of the route hierarchy or a key user flow.
5. **`<h2>Auth, Roles & Middleware</h2>`** — mechanism, session strategy, role
   matrix (table: Role · Can do), and where guards live.
6. **`<h2>Jobs & Integrations</h2>`** — cron/queue/background jobs (table:
   Job · Trigger · What it does), external services, and an **Environment
   variables** table (Name · Purpose · Required) — names only, never values.

Use `<div class="note">` for caveats and `<div class="note warn">` for risks.
Mark genuinely-empty areas with `<span class="empty">none found</span>` rather
than omitting the section.

## Guardrails
- **Never** print secret values — only env-var *names* and their purpose.
- Don't fabricate. If something can't be determined, say so with `.empty` / a note.
- Keep it scannable: tables and short lines over prose. This is a planning
  reference, not a tutorial.
- Single file only: no external assets except the Mermaid CDN already in the
  template (mention in a note that diagrams need internet to render).
- After writing, tell the user the path and a one-line summary of what was found
  (e.g. counts of tables/endpoints/pages).

