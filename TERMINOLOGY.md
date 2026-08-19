# Astromech — Terminology Reference

Terms that are ambiguous, easily confused, or have meaningful design decisions behind their naming.

Names here are chosen from established web-ecosystem vocabulary wherever one
fits, and a term that already means something specific to a web developer is not
reused for something else — see `decisions/0005-ai-context-naming.md`.

Each entry says what a term means today. Why it beat the alternative is in
`decisions/`, linked from the entry.

---

## Driver

The standard term for any pluggable backend implementation in Astromech. A driver knows how to communicate with a specific external system and exposes a consistent interface.

Current drivers:

- **DatabaseDriver** — wraps a database connection (`libsql()`, `d1()`)
- **StorageDriver** — wraps a file storage backend (`filesystem()`, `r2()`, `s3()`)
- **EmailDriver** — wraps an email sending service (`smtp()`, `resend()`, `consoleEmail()`)
- **ImageDriver** — transforms an image variant (`sharp()`, `cloudflareImages()`)
- **SchedulerDriver** — produces the ticks that drive due-evaluation (`interval()`, `webhook()`, `cloudflareCron()`)

Every driver is a lowercase factory on its own subpath — `astromech/storage/r2`,
`astromech/email/smtp`, `astromech/scheduler/interval` — never a class or a
pre-built singleton on the root barrel. See `apps/docs/configuration/storage.md`
for the storage set and `decisions/0032-a-capability-slot-holds-what-the-config-declared.md`
for why the factory is the one style.

An **adapter** is a different thing: it reshapes one internal interface into another, as `tableStorage` reshapes a plugin table into `EntryStorage`. A driver reaches an external system. `decisions/0012-driver-not-adapter.md` records why the two words are kept apart.

---

## Driver vs port

A **driver** is what the host configures. It goes in a capability registry in
`astromech.config.ts` (`db`, `storage`, `email`, `media.image`, `scheduler`), and
core reads it back from that capability's registry rather than off the config.
Swapping one is a site's decision, and every driver of a kind satisfies the same
interface so nothing above it changes.

A **port** is the narrow handle a plugin receives on `PluginContext`
(`packages/astromech/src/types/plugins.ts`). `ctx.storage` prefixes every key with
`plugin/<alias>/`, `ctx.email` renders a React element and throws when no email
driver is configured, `ctx.database` exposes `{ dialect, dump?, restore? }`
feature-detected off the driver, and `ctx.methods` hands out only the methods the
acting role may call.

They are not two names for one thing. A driver's interface is the whole
capability, and a plugin holding one could reach past its own scope — every
object in the bucket, any envelope sender, any table. A port is a smaller
interface chosen for what a plugin is allowed to do, which is why
`PluginStorage` and `StorageDriver` are separate types rather than one aliased to
the other.

`ctx.db` is the exception: it is the raw `Kysely` instance, not a port.

`decisions/0007-plugin-core-boundary.md` covers how plugin code reaches core, and
`decisions/0008-plugin-methods-port.md` the shape a port takes.

---

## Entry type vs EntryType

**Entry type** refers to the concept — a named content type (e.g. "posts", "products"). It is identified by its string name throughout the API.

**`EntryType`** is the object that defines an entry type: its field groups, slug rules, admin columns, etc. (`packages/astromech/src/types/config.ts`). It is what `defineEntryType` takes and returns.

The derived forms carry the qualifier: **`ResolvedEntryType`** is the boot-time shape, **`AdminEntryType`** the browser-safe subset the admin SPA receives.

---

## Field vs FieldType

**`Field`** (`packages/astromech/src/types/fields.ts`) is one field's spec — its name, type, label and options. **`FieldType`** is the registry entry behind a `Field.type`, carrying that type's `build`, `coerce`, `validate`, `tsType` and `children`; **`FieldTypeName`** is the union of the core type names.

`Field` names a spec while `Entry` names a stored row, and that asymmetry is deliberate: an `Entry`'s spec is its `EntryType`, so `EntryType`/`Entry` and `Field`/field values are the same shape one level down.

---

## Layout field vs nested field

Field types split on one rule: **a field whose `name` is a data key stores data; a field whose name is inert does not.**

**Layout field** — `section`, `tabs`, `tab`, `accordion`. Four types, and the only presentational ones: they draw structure and store nothing. Their children keep top-level data keys, so data stays flat underneath them, and a layout field's own name never appears in a field path. They have no `FieldType` at all (`packages/astromech/src/fields/core-field-types.ts`) — there is no value to coerce or validate.

**Nested field** — `group`, `repeater`, `blocks`, `tree`. Four types that own one data key each and nest their children's values under it. Each fills the `children` slot on its `FieldType`, which is how the validation pipeline recurses without switching on field type.

Every other field type is a leaf: one data key, no children.

**Presentational** is the adjective for the layout half. Distinct from the admin **shell** (`packages/astromech/src/admin/shell.astro`), which is the furniture around a page rather than inside a form. `decisions/0016-the-fields-module-vocabulary.md` records what both names beat.

---

## Resource

The superordinate noun for the four things that carry fields and run the field pipeline: an **entry**, a **media item**, a **user**, and a **settings page**. `ResourceType` (`packages/astromech/src/types/domain.ts`) is that union, and it types `resource.kind` on both validation contexts — the pipeline is resource-generic, so a validator can see which kind of resource it is running against.

A **resource validator** is the whole-resource `validate` an author declares on any of the four: the cross-field rules no single field owns. Each write path reads it straight off `virtual:astromech/config` (`entryType.validate`, `config.media?.validate`, `config.users?.validate`, the matching `admin.pages[].validate`).

**`TargetKind`** (`packages/astromech/src/fields/relationship-edges.ts`) is the relation-eligible subset: entry, user, media. A settings page carries fields but cannot be pointed at by a relation, so the two unions differ and both exist. `decisions/0017-resource-as-the-superordinate-noun.md` records why `resource` beat `record` and `document`.

---

## Entry vs Record

**Entry** is the Astromech term for a single content item stored in a collection. Avoid saying "record" — it conflates CMS content with raw database rows.

---

## Entry vs table-backed type (as data worlds)

**Entry** — the built-in content unit, on the fixed core schema, with the full feature set available to it (statuses, slug, versions, staging, trash, translation, preview, relationships).

**Table-backed type** — a plugin-defined custom table (redirects, logs) on its own schema and its own storage. A table-backed type reaches the admin through `tableStorage`, an `EntryStorage` adapter that declares `supports: []`, so all entry chrome switches off. `Table` (the type `defineTable` returns) is a table's schema object, not a data world.

The two are separate internally and share only the admin surface. `supports` gates behaviour and UI, **never** schema — toggling one needs no migration, and storage is always full.

Note the neighbouring clash: `<domain>/storage/` is DB access; top-level `storage/` is media binary/blob drivers. Different concepts.

---

## Trash vs Delete

These are distinct operations on the entries service:

- **`trash()`** (soft delete) — sets `deletedAt` on the entry; the row is preserved.
- **`delete()`** — **permanent**. Removes the row and its `relationships` rows outright.
- **`emptyTrash()`** — permanently deletes every trashed entry of a type in one go (also cleans up their `relationships` rows first).
- **Restore** — clears `deletedAt`, returning a trashed entry to active status.

`trash()` and `delete()` are two separate, named methods — there is no `forceDelete()`.

---

## Populated record

**There is no populate mechanism.** A relationship field reads back as the IDs stored in the field data; resolving those into whole entries is the caller's job, in a second read. Field data is the source of truth, so there is nothing to resolve _from_ the index — `decisions/0004-relationships-as-a-derived-index.md` has the reasoning.

The term survives only in a validation message: a **populated record** is an entry object sent where an ID belongs, which is what a caller writing back an expanded read produces. `relationship` and `media` reject it — `Must be an id, not a populated record`, or `Must be a list of ids, …` on a `multiple` field — rather than accept it silently.

---

## Publish / Schedule / Unpublished

The three values of `EntryStatus`:

- `unpublished` — not publicly visible
- `published` — live
- `scheduled` — will transition to published at `publishedAt` time

`scheduled` is a status value with no enforcement behind it: nothing performs the
transition. See `roadmap/completed/versioning-publishing-scheduling.md`.

---

## Versioning

Per-entry-type opt-in via `EntryType.versioning: true`. When enabled, a snapshot of the entry's fields and status is saved to the `entry_versions` table on each update.

The table always exists in the schema regardless of whether any entry type enables versioning.

This is **backward versioning** — an immutable, append-only record of the past. Contrast it with a **staged entry** (below), which is a mutable, prepared _future_ change. The two are distinct and do not unify: a **version** is a past snapshot for record-keeping; a **staged entry** is a forthcoming change you prepare, preview, and merge on purpose.

---

## Staged entry (forward versioning)

A **staged entry** is a separate, fully-editable `entries` row that holds the next version of an already-live entry without touching the live one — you prepare it, preview it, then merge it deliberately (rather than Astromech's default of editing live in place).

- It links to its **canonical** entry via the nullable `stagedFor` FK (`stagedFor IS NULL` ⇒ canonical; non-null ⇒ staged). It reuses all entry machinery (fields, validation, its own preview) and gets a **fresh `localeGroup`** — `stagedFor` is the only link.
- It shares the canonical's slug (staged rows are excluded from the slug unique index and from entry lists) and is always `unpublished`.
- Enabled per-type by the **`staging`** capability — default off, **independent of `versioning`**, built-in storage only.
- Service ops (all keyed off the **canonical** id): `createStaged` (throws `StagedEntryExistsError` carrying the existing staged id — one staged change per canonical), `getStaged`, `mergeStaged`, `deleteStaged`.
- **Merge** = backup (only if `versioning`) → update the canonical in place (id + slug preserved) with the staged content → hard-delete the staged row. Merge is **content-only**: it does not change the canonical's status (publishing stays a separate action). Staged entries are never trashed — discard and merge-cleanup both hard-delete.

---

## Preview token

A secret that authorizes reading an entry through the **publish/schedule gate** on its normal public slug route — used to review unpublished or staged content before it goes live.

- One token per canonical entry; the plaintext is returned **once** on issue and only its **hash** is stored (`entry_preview_tokens`); revocable; optional TTL.
- The token only **authorizes** (bypasses the publish/schedule gate, returning the **public** shape — never `full`); URL selectors pick the layer: `?preview=<token>` previews the current entry, `&staged=1` previews its staged change.
- An invalid or absent token falls back to normal public behaviour → non-published content returns nothing → 404 (no existence hints).

---

## basePath (config) vs Admin Routes (SPA pages)

`basePath` in `AstromechConfig` is a **string** — the URL prefix for the admin panel (default: `"/cms"`). The API is derived from it and served at `${basePath}/api`; media keeps its own top-level `mediaRoute`.

"Admin routes" (or "admin pages") refers to the **pages registered in the SPA** — either built-in pages (collections, media, users, settings) or plugin-contributed pages via the `admin:registerRoutes` hook.

These are different concepts that share a name. When speaking about the SPA extension mechanism, prefer "admin pages" to avoid confusion.

An **admin slot** is distinct from an admin page: a named mount point in the admin shell (`toolbar`, `right-drawer`, `global-overlay`) for **persistent chrome** that lives outside any single page. Plugins contribute components via `admin.slots`. A page is a routed destination; a slot is always-present UI.

---

## Mount (entry types)

Where an entry type is served from: the root, or a plugin. A root type is addressed bare (`post`), lives under `/entries/{type}` in the admin, and carries `entry:{type}:{action}` permissions; a plugin's type is addressed by its qualified id (`redirects/redirect`), lives under `/plugin/{name}/entries/{type}`, and carries `plugin:{namespace}:entry:{type}:{action}`.

**`mount`** on an `EntriesManifestMethod` (`packages/astromech/src/types/methods.ts`) names it — `'root'`, or the owning plugin's permission namespace. It is a permission namespace and a label, never an identifier to call with: the callable id is the sibling `typeId`, carried rather than re-derived from `mount` + `entryType`. Tool dispatch reads it for the tool name, so two plugins each mounting a `page` type do not collide (`entries_redirects_page_create` against a root type's bare `entries_page_create`).

**`EntriesMount`** (`packages/astromech/src/admin/components/entries/mount.ts`) is the admin's object for the same thing: the entries client, the wire type id, the react-query cache scope (`''` at the root, otherwise the plugin name), the single-type admin config, the link base and a `permissionFor(action)` resolver. The shared entry pages — list, new, edit, versions — take one as a prop, so a root route and a plugin route render the same components. Root routes build it inline; `buildPluginEntriesMount` builds the plugin one, returning `null` for an unknown plugin or type.

Distinct from the ordinary web-framework verb: `mountRestRoutes` and "the entries router, mounted at `/entries`" mean attaching a handler at a URL prefix, and a "mount point" in the admin shell is a named slot (above).

---

## Relation vs Relationship

**Relation** — a field type (`'relationship'`) on an entry type that links an entry to one or more entries (or users) in another type. Authored with `fields.relationship(name, { target, multiple })`.

**Relationship** — the row in the `relationships` table recording one source→target edge, keyed on a composite primary key over `(sourceId, sourceKind, instancePath, targetId, targetKind)`. There is no `name` and no `position` column: ordering lives in field data and nowhere else.

A single relation field definition can produce many relationship rows.

**Field data is the source of truth; the `relationships` table is a derived, rebuildable index.** It is read for exactly three things — reverse lookup, filter-by-relation (`where: { references: … }`), and delete-time information — and never for a forward read. `astromech index:rebuild` regenerates it from field data; `--check` reports drift without writing. Why it is built this way, and the alternatives rejected, are in `decisions/0004-relationships-as-a-derived-index.md`.

Each row carries two paths, and the distinction matters:

- **Schema path** — the shape a query matches against (`sections[].gallery`). Indexed, derived from the type definitions.
- **Instance path** — where the edge actually sits in one entry's data (`sections[a1].gallery`, addressing items by their persisted `_id`). Stored, never pattern-matched.

Note also that `col.reference()` in the `defineTable` layer means a real foreign key and is a **different** thing from a content relationship. Don't conflate them.

---

## Backup run vs Backup artifact

**Backup run** — a row in `plugin_backups_runs`. Always present; records the outcome (`success`/`failed`/`running`) and trigger (`scheduled`/`manual`/`pre-restore`). Rows are never hard-deleted (manual delete marks `artifactDeletedAt` only).

**Backup artifact** — the stored `.sqlite.gz` file in plugin-scoped storage. A run only has an artifact if it succeeded; the artifact may be pruned by retention while the run row persists.

---

## Restore (backups)

A full-DB rollback performed by `@astromech/backups`: replaces all user tables from a backup artifact using `ATTACH` + a transactional per-table copy. **Preserves** the two operational tables (`plugin_backups_runs` and `_astromech_cron`) so the scheduler and run history survive the restore. Requires the backup's schema to match the live schema (fails loudly otherwise). Always preceded by an automatic `pre-restore` safety snapshot.

Not to be confused with **Restore** (entries) — clearing `deletedAt` on a trashed entry.

---

## Rotation / retention (backups)

After each successful backup, the plugin prunes the oldest artifacts so that at most N are retained (default 7, configurable). Pruned artifacts are deleted from storage and their run rows are marked with `artifactDeletedAt` — the row itself is kept so run history remains intact. `pre-restore` snapshots are currently counted toward the keep-N limit (excluded count is a backlog item).

---

## Merge tag vs Placeholder (forms)

**Merge tag** — a `{{token}}` an author writes into a form notification's recipient, subject or body, substituted with that submission's values at send time (`notifications/merge-tags.ts` in `@astromech/forms`). `{{fieldName}}`, plus `{{formTitle}}` and `{{submittedAt}}`. Unknown tags are left visible rather than silently deleted. The term is the form world's own — Gravity Forms, Mailchimp.

**Placeholder** — a form field's greyed-out input hint, stored as the `placeholder` key on a field block. Never means `{{token}}`; `decisions/0001-forms-vocabulary-and-table-directories.md` records the split.

---

## Notification (forms)

One message an editor configures to be sent when a submission is accepted, stored as a block instance on the form's `notifications` field. The block's kind (`_type`) selects the **notification provider** that delivers it — `email` is the only built-in. There is no separate "confirmation": an email notification addressed to a literal address is a site notification, one addressed to a merge tag such as `{{email}}` is a confirmation to the submitter, and nothing in the code distinguishes them.

---

## Schema vs Tables

**Tables** — `defineTable` / `definePluginTable` calls and nothing else. A core domain keeps its tables in `<domain>/tables.ts`; every table-bearing plugin keeps its in `src/tables/`, publishes them (where a consumer needs them) as a `./tables` subpath, and `astromech plugin:generate --tables` reads that module to diff against the package's migration snapshot. Core's `@/database/tables` aggregates every domain's tables plus the few (`relationships`, `cron`, plugin-tracking) that have no domain of their own. A table export is named `<noun>Table` (`entriesTable`, `cronTable`, `submissionsTable`) — the noun matching its SQL table name, the suffix separating it from the domain word and the domain's service.

**Schema** — request validation, or an aggregate shape. A core domain's `<domain>/schema.ts` holds the domain's Zod request schemas and nothing else; a domain that validates no request input has no such file, and its tables live in `<domain>/tables.ts` alongside. The wider "whole shape" sense survives in two names: the `astromech/database/schema` public subpath (every table plus the seed-facing codec and `DB` type) and `@astromech/schema-engine` (diffing and rendering DDL). `decisions/0075-tables-split-from-domain-schema.md` records splitting the tables out of the domain schema file; `decisions/0001-forms-vocabulary-and-table-directories.md` has the original tables-directory reasoning.

---

## `ai` capability

Model access. `packages/astromech/src/ai/` sits with `email` and `cron` below the domains: a site that configures an `ai` block makes a model available to every domain and plugin, and a site that doesn't has none. The whole surface is `getModel(name?)`, which returns the named model, falls back to the default one when that name isn't configured, and returns `undefined` when nothing is; and `hasModel(name?)`, which answers the same question without the instance. A consumer branches on `undefined` to disable its feature — there is nothing to catch.

What `getModel` hands back is **already wrapped** with `wrapLanguageModel`, so core's middleware applies to every call and a consumer cannot ask for a model without it. Core stops there: generation is the caller's, using `generateText`, `streamText` or `Output.object` from the AI SDK directly. `decisions/0022-core-hands-out-a-model.md` records why there is no facade over those.

Distinct from **AI context** below, and the two are at different layers rather than competing for a word: `ai` is model access, AI context is one input that may travel through it. See `apps/docs/configuration/ai.md` for configuring it.

---

## AI context

What an admin route declares about the thing the user is currently looking at, so a model can resolve "this page" or "this field". A route contributes an `AiContextReference` (`{ kind, type?, id?, label }`) via `useAiContext`; the chat drawer assembles the current ordered set into a `role: 'system'` message inside `messages[]` — never into the system prompt, which would invalidate the prompt cache on every navigation.

Contributions are ordered, not a flat set: a layout, its route and a focused field editor can all contribute at once, and order is what decides which one "this" refers to.

Distinct from **React context**, which is a rendering mechanism and unrelated. The `AI` prefix is load-bearing — bare "context" in this codebase means React's, and "context bus" would mean an `emit`/`subscribe` event bus, which this is not. `decisions/0005-ai-context-naming.md` records the names rejected.

---

## Tool definition vs MCP tool

A **`ToolDefinition`** is one manifest method projected into a model-callable tool: the `id` of the method it projects, its name, description, input schema, annotations, declared permission, a `confirmMessage(args)` that returns the question to put to a human before running it, and an `invoke` that resolves the service method at call time. `id` is the only key a caller may index a tool on — `name` is not unique, since `entries.create` is the name of every entry type's create — and `confirmMessage` is where core owns the wording of an approval question rather than leaving each transport to word its own. The type is transport-agnostic, which is why it lives in `packages/astromech/src/transport/tools/` and is shared by the MCP server and the AI tool-loop. `buildScopedDispatch` produces the one an untrusted caller must use, resolved through `scopedServices` so every call is checked against the caller's role.

**`McpToolDef`** in `packages/astromech/src/transport/mcp/tools.ts` is the MCP wire shape, built from a `ToolDefinition` when that transport serves one. The two are deliberately separate types: one is what a tool is here, the other is what a particular protocol expects to receive.

`decisions/0014-naming-the-ai-tool-surface.md` records why the definition is not called a dispatch, and `decisions/0008-plugin-methods-port.md` why the scoped builder is a separate function.

---

## Application (the Astromech instance)

The **application** is the booted runtime a process holds: the object
`createAstromech({ config })` returns and `getAstromech()` reads back. It carries
the resolved config and the domain services, and it is the one front door — a
process has exactly one, held in a `globalThis`-backed registry because one module can be
instantiated more than once in a process and a module-scoped memo would boot
twice. `packages/astromech/src/registry.ts` records why.

The pair is split on purpose, following Laravel (`bootstrap/app.php` creates,
`app()` only reads). `createAstromech` initialises and is idempotent: a second
call with the same config object returns the existing instance, a different one
throws, and a failed boot clears the registry so the next caller retries.
`getAstromech()` never creates and throws when the registry is empty. Two functions
that both initialise would be two front doors, which is what this replaced.

"Application" rather than "app" (which reads as `apps/`, the deployed sites),
"kernel" (Laravel's `HttpKernel` is a request handler, which this is not) or
"container" (it resolves nothing; the per-domain registries stay underneath it).

---

## Integration

An **integration** is the glue that lets one host — an Astro site, a Cloudflare
Worker — serve an Astromech application. It carries no domain logic:
`packages/astromech/src/integrations/` holds two, `astro/` (the `astromech()`
Astro integration, its Vite wiring, the injected routes, the middleware, and the
one-line request handler) and `cloudflare/` (`createWorkerEntry`, which returns a
Worker's `fetch` and `scheduled`).

An integration makes four moves: capture the request in the host's native form,
get the application (`getAstromech`), hand it over (`app.fetch`), and emit the
result. One that needs a new branch in core is reporting a missing application
capability, not a reason to grow.

"Integration" rather than "adapter": Astro already uses "adapter" for its deploy
targets, and `decisions/0012-driver-not-adapter.md` reserved "driver" for our own
pluggable backends, so "adapter" is taken twice here. Better Auth's framework
glue and Astro's own vocabulary both say integration.

---

## Approval vs Confirmation

Both stop a mutating call to put it to a human, and they are different mechanisms at different altitudes.

An **approval** is a stored decision. `@astromech/assistant` declares every mutating tool with no `execute`, so a turn reaching one halts with nothing mutating run; it then writes a row per held call into `plugin_assistant_approvals` and asks the user. Read-only calls made in the same step have already run, so a paused turn may carry part of its answer. The answer arrives on a later request naming the row's id; claiming and answering the row are one conditional UPDATE, so a row is won once, by one request, and only while it is that user's and still pending. The call then runs with the arguments stored on the row. Because the arguments live server-side, a client that edits the conversation it posts back changes what the model sees, not what runs.

A **confirmation** is a stateless brake at dispatch level — `evaluateConfirmation` in `packages/astromech/src/policies/confirmation.ts`. A mutating call arriving without an answer is turned back with `input_required` and the question to ask; the caller re-issues the call carrying `_confirm: { action }`. It buys one turn between an agent deciding to do something and it happening, which is enough to break a runaway loop, and it is explicitly not a security boundary: the caller supplies the answer, so a caller that wants to proceed can write one itself.

The types stay apart for the same reason: `ConfirmRequest` carries the arguments a caller may re-post, `ApprovalRequest` names a row the arguments are read back from.

---

## Policy

A **policy** is code that answers what an actor may do, not how a request reaches it — the sense Laravel Policies, Pundit and IAM policies all share. `packages/astromech/src/policies/` holds four: `scoped-services.ts` (`scopedServices(role)`) is the one that enforces, handing out service handles a caller cannot exceed; `method-filter.ts` is structural filtering of what a transport exposes; `annotate-manifest.ts` is advisory only, by its own header; and `confirmation.ts` is the stateless brake described above. None of the four is a per-request interceptor, which is what "guard" names in NestJS, Angular and Vue Router (`canActivate`, a boolean per route) — a different shape from what any of these four return.

`permissions/` is the sibling directory: it holds the permission vocabulary a policy applies — `Permission`, `Role`, `permissionsFor` — the Gate half of Laravel's Gate/Policy split. `decisions/0040-policies-and-manifest-registry-keep-their-directories.md` records why "guard" lost.
