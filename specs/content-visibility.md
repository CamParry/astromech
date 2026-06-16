# Content Visibility — Public vs Full reads, field-level privacy, audience filtering

**Status:** Implemented (Steps 1–6) 2026-06-16. Remaining: demo cleanup + browser-verify (Step 7). Note: the public/private _settings_ + `publicSettingKeys` derivation + `AdminPage.public` landed via the parallel unified-admin-pages work; this spec's Step 6 reconciled with it.
**Supersedes:** ROADMAP "Disabled-item filtering & public vs admin read path" (`ROADMAP.md:239-245`) — generalises it.
**Touches:** field types + builders, SDK type-generator, entries orchestrator (local SDK), fetch SDK, API routes + permissions, settings surface, demo read path.
**Related:** [[typed-entries-api.md]], [[entry-schema-authoring.md]], [[plugin-architecture.md]]. Reserved-key convention: memory `project_reserved_instance_keys.md`.

---

## 1. Background & Motivation

Block and repeater **items** can be toggled `_disabled` in the admin (the flag persists in stored data). Today nothing filters reads: disabled items, draft/scheduled entries, and any "internal" data are returned to **every** caller. The demo only avoids rendering disabled blocks because `demo/src/components/blocks/Blocks.astro:29` manually does `.filter(b => !b._disabled)`. That is both a **footgun** (every consumer must remember) and a **data-leak surface** (hidden content is still _sent_ to the client).

Critically, the "frontend uses local SDK, admin uses HTTP" split does **not** isolate the two — the admin's HTTP route calls the same local SDK orchestrator (`src/api/routes/entries.ts:286` → `Astromech.entries.query`). And the demo frontend reads via the **local SDK directly** for SSR (`demo/src/lib/data.ts:5`), _not_ the HTTP API. So a filter hidden "by path" is impossible; visibility must be an **explicit, derived signal**.

This spec solves the general problem, not the one-off: the same mechanism gates `_disabled` items, draft/scheduled status, internal fields, and (later) members-only content.

### Current-state facts (verified 2026-06-15)

- **Orchestrator seam:** `src/sdk/local/entries.ts` — `query()` (491-546), `get()` (548-577), `asEntry()` identity cast (78-80). `config`, `resolveEntryType`, `flattenEntryFields`, and `getCurrentUser()` are all in scope here. This sits above raw storage and is the single seam every read passes through.
- **Storage:** `status` and `publishedAt` are top-level **columns** (`src/db/schema.ts:117-120`), not inside the `fields` JSON blob — so a status row-filter is cheap. `deletedAt` likewise a column.
- **Populate:** `src/db/repositories/populate.ts` walks **only top-level relationship fields** and applies **no visibility filter** to related entries. `flattenEntryFields` (`src/core/entry-fields.ts`) treats group/repeater/blocks as opaque leaves. Nesting is arbitrary.
- **Field model:** field builders are **POJO factories** (`src/builders/fields.ts`), not chainable — a visibility marker is a property on `FieldDefinition` (`src/types/fields.ts:89-140`), not a `.private()` method.
- **Type generation:** `src/core/type-generator.ts` emits per-collection field/relation types and already recurses the field tree; block/repeater instance types there carry `_id`/`_type`/`_disabled?`/`_title?`. This is where a second derived type is emitted.
- **HTTP boundary:** all entry routes are behind `requireAuth` (`src/api/index.ts:93`); roles today are `admin` (`*`) and `editor` (`entry:*`) (`src/core/permissions.ts:22-33`). Handlers forward client query params straight into the SDK and return the raw entry — the escalation surface.
- **Settings:** `GET /settings/:key` is behind `requireAuth` + `settings:read` (`src/api/routes/settings.ts`); there is no per-setting public flag and no public read path.

---

## 2. Decisions (Locked)

These were reached through design discussion (chat session 2026-06-15).

### Model

1. **Two orthogonal axes**, both derived from _the current user + role_ (no new "actor" noun):
    - **Shape (projection / field axis):** `public` vs `full`. _What fields/internals_ you see. Binary; role gates `full`.
    - **Audience (row axis):** _which entries_ you may see at all. A row filter keyed to role/identity. v1 implements **status** (draft/scheduled/published); **members-only** content is the same machinery added later.
2. **No per-field-per-role access.** There is no "field X is visible to role Y." There are exactly **two fixed, named shapes** (`public`, `full`); role only gates _which shape you may request_. This is the key simplification and the thing that keeps types honest.
3. **Field default is public.** A field is public-readable unless explicitly marked `private`. Marker lives on `FieldDefinition` as `private?: boolean` (default-by-absence = public, matching the `_disabled` convention). Author-facing wording may also expose `public: false`; canonical stored form is `private: true`.
4. **Internals are always stripped from `public`**, regardless of field markers: `_disabled` items are **removed** (recursively); surviving instance objects have `_disabled` and `_title` **deleted**; `_type` and `_id` are **kept** (frontend needs `_type` to render; `_id` is a non-sensitive render key). Drafts/scheduled rows are excluded by the audience filter.
5. **Mutations are always private.** Create/update/delete are never public — trusted local call or capability-gated HTTP. No opt-out.
6. **Settings are private by default** (already true: behind `requireAuth`). Opt-in per key/namespace for public read.

### Surfaces & defaults (intent-by-which-handle-you-hold)

7. **Default shape depends on the handle, not the transport:**
    - `import Astromech from 'astromech/local'` (the bare local import — what the **frontend SSR** holds) → default **`public`**.
    - `ctx.entries` inside **hooks/cron** (privileged server context) → default **`full`**.
    - The **admin fetch client** → default **`full`** (authenticated admin).
    - A future **anonymous/member HTTP** request → **`public`**.
8. **`full` is honoured unconditionally on trusted local handles** (the server is trusted, like WordPress `wp_insert_post`). **On the HTTP boundary `full` is capability-gated**: requesting `full` without the capability is a **403** (loud break, like WP `context=edit`), never a silent downgrade. The wire may **request** a shape but may never **escalate** beyond its role.
9. **Read methods gain `full?: boolean`** (default `false` = public). Clients also carry a constructor-level default shape (per decision 7) so the admin doesn't annotate every call.

### Typing

10. **Two derived types from one schema.** The type-generator emits, per collection, the existing full `${Pascal}Fields` **and** a new `${Pascal}FieldsPublic` (= full minus `private` fields; instance types omit `_disabled`/`_title`). Public nested relations reference the _public_ type of the related collection (audience composes through populate at the type level too).
11. **No polymorphic `Response<Role>` type** (confirmed industry norm — Payload/Keystone/Strapi/Directus keep one type + optional fields, which _lies_ at runtime; WordPress uses two named shapes selected by a capability-gated flag). We use the WordPress model **but auto-derive both types from one schema** — so, unlike WP, no dual hand-maintenance, and unlike Payload, the public type never lies. Reads default-return `TypedEntry<PublicFieldsFor<T>>`; the `{ full: true }` overload returns `TypedEntry<FieldsFor<T>>`.
12. **Read-public-then-write breaks loudly.** A value read in `public` shape must not be silently written back (it would drop private fields + disabled items). Enforced by a **type-level brand** (primary) + a **runtime guard** (defense-in-depth). See §6.

### Scope

13. **v1 = shape (`public`/`full`) + `_disabled` strip + private-field strip + status audience filter + settings-private-by-default.** Member audiences, per-field audience, and `preview` shape are **out of scope** but the seam is built so they slot in (§9).

---

## 3. The two axes in one table

| Viewer / handle                                                | Shape    | Rows visible                    |
| -------------------------------------------------------------- | -------- | ------------------------------- |
| Anonymous (future public HTTP) / bare `astromech/local` import | `public` | published only                  |
| Member (future)                                                | `public` | published **+ member-audience** |
| Admin / editor (admin fetch client, `ctx.entries`)             | `full`   | all (subject to `trashed`)      |

`public` = published rows + public fields + internals stripped. `full` = everything. The axes move independently: a member gets the **public shape** but a **wider audience**.

---

## 4. Field-level marker

`src/types/fields.ts` — add to `FieldDefinition`:

```ts
export type FieldDefinition = {
    // ...existing...
    /** When true, this field is omitted from `public`-shape reads. Default: false (public). */
    private?: boolean;
};
```

`src/builders/fields.ts` — add `private?: boolean` to `BaseOptions` (and any per-field options type that doesn't extend it) so every builder passes it through via the existing spread. No new builder functions.

Applies at any depth: a field marked `private` inside a group/repeater/block is stripped from the public shape at that level.

---

## 5. Two derived types (`src/core/type-generator.ts`)

The generator already walks the field tree to emit `${Pascal}Fields` and `${Pascal}Relations`. Extend it to also emit a **public variant**:

- **`${Pascal}Fields`** (unchanged): all fields. The **full** shape. Used by writes and `{ full: true }` reads.
- **`${Pascal}FieldsPublic`** (new): emitted by the same walk with a filter — skip any field with `private: true`; for block/repeater/tree instance types, **omit `_disabled` and `_title`** from the element type (keep `_id`, `_type`, `_children`). Public relations reference the related collection's `…FieldsPublic`.

Entry-type map (`src/types/sdk.ts`) gains the public variant alongside the full one:

```ts
// Augmented per-collection map entry
interface AstromechEntryTypes {
    [type: string]: {
        fields: FullFields;
        fieldsPublic: PublicFields;
        relations: Relations;
    };
}

export type PublicFieldsFor<T extends keyof AstromechEntryTypes> =
    AstromechEntryTypes[T]['fieldsPublic'];
```

`TypedEntriesApi` read overloads (extends [[typed-entries-api.md]] §3.2):

```ts
// Default (public)
query<T>(params: { type: T } & Omit<EntryQueryParams,'type'|'full'>):
    Promise<QueryResult<TypedEntry<PublicFieldsFor<T>>>>;
// Full (capability-gated at HTTP; trusted on local)
query<T>(params: { type: T; full: true } & Omit<EntryQueryParams,'type'|'full'>):
    Promise<QueryResult<TypedEntry<FieldsFor<T>>>>;
// ...same pattern for get()
```

---

## 6. Runtime visibility filter

### 6.1 Seam

A single recursive transform applied at the **end of `query()` and `get()`**, after populate, before return (`src/sdk/local/entries.ts` ~533 and ~576). New module `src/core/visibility.ts`:

```ts
export type VisibilityOptions = {
    shape: 'public' | 'full';
    fields: FieldDefinition[]; // flattened/resolved type fields for this entry type
    audience: AudienceContext; // { role, now } — v1: drives status filter
};

/** Returns the filtered entry, or null if the audience may not see this row at all. */
export function applyVisibility(entry: Entry, opts: VisibilityOptions): Entry | null;
```

- `query()`: map rows through `applyVisibility`, drop `null`s, then compute pagination from the surviving count. (Note: page-count interaction — see §9 open Q1.)
- `get()`: return `null` if filtered out (consistent with not-found).

### 6.2 What `full` does

Nothing. Returns the entry unchanged (the trusted/admin path). The whole transform is a no-op when `shape === 'full'`.

### 6.3 What `public` does

**Row (audience) filter — return `null` if any fail:**

- `status === 'published'`, and
- `publishedAt == null || publishedAt <= now`, and
- `deletedAt == null` (already enforced by default `trashed: false`, kept as belt-and-braces).

**Projection (field) strip on the surviving entry's `fields`:**

1. Delete any field whose definition has `private: true` (use `fields` to know which keys; recurse into group/repeater/blocks using their child definitions).
2. Structural strip (schema-free, depth-agnostic, applied everywhere): for any array, drop elements that are objects with `_disabled === true`; on surviving objects, `delete obj._disabled; delete obj._title;` then recurse into all values.
3. Populated relationship values are plain entry objects in `fields` by this point — recurse into them and apply the **related type's** public projection (private fields of related entries are stripped too). If a relationship field is itself `private`, it's removed in step 1 before recursion.

`_type` and `_id` are preserved. The structural strip (step 2) is safe because these are reserved underscore keys we own.

### 6.4 Write-back guard (read-public-then-write breaks loudly)

Two layers:

- **Type-level brand (primary).** Generated `${Pascal}FieldsPublic` carries `readonly __shape?: 'public'`; the **write input** (`create`/`update` `data.fields`) is typed `Partial<FieldsFor<T>> & { readonly __shape?: 'full' }`. A fresh object literal has no `__shape` → assignable (normal authoring unaffected). A value read in public shape carries `__shape?: 'public'`, which is **not** assignable to `__shape?: 'full'` → **compile error**. Full reads carry `__shape?: 'full'` → assignable. _(Needs a type-level spike to confirm ergonomics across spreads/`Partial`; if too noisy in practice, fall back to runtime-guard-only — see §9 open Q2.)_
- **Runtime guard (defense-in-depth, covers untyped JS).** `public`-shape reads stamp results with a non-enumerable `Symbol` brand. `create`/`update` throw `PublicShapeWriteError("entry was read in 'public' shape; re-read with { full: true } before saving — saving it would drop private/internal fields")` if handed a branded value.

---

## 7. SDK surfaces & HTTP gating

### 7.1 Read flag + client defaults

- `EntryQueryParams` and `get` params gain `full?: boolean` (default `false`).
- `entries.query/get` resolve the effective shape: explicit `full` arg → that; else the **client default** (decision 7).
- Local SDK (`src/sdk/local/index.ts`): bare `Astromech` defaults `public`. `ctx.entries` (hook/cron context) constructed with default `full`. Both trusted: an explicit `{ full: true }` is honoured without a capability check.
- Fetch SDK (`src/sdk/fetch/index.ts`): `createEntriesApi` accepts a default shape; the admin SPA constructs its client with default `full`. The flag is sent on the wire (query param / body) and **re-validated server-side** (never trusted).

### 7.2 HTTP boundary capability gating (`src/api/routes/entries.ts`)

In the GET list / GET :id / POST query / POST :type/query handlers, after the existing `can(role, permissionFor(type,'read'))` check:

```ts
const wantsFull = parseFullFlag(c); // from query/body
if (wantsFull && !can(role, 'entry:read:full')) return forbidden(c); // 403, loud
const result = await Astromech.entries.query({ ...params, full: wantsFull });
```

- Add permission `entry:read:full` to `src/core/permissions.ts`. Covered by `*` (admin) and `entry:*` (editor); absent for any future member/anonymous role.
- Default (no flag) → `public`. The handler must pass the resolved shape explicitly into the SDK (so the HTTP path doesn't inherit the local client's default).
- Stop forwarding the client's raw `full`/shape intent any further than this gate.

### 7.3 Mutations require full

`create`/`update` input `data.fields` typed as the full shape + write brand (§6.4). Bulk variants likewise. No public write path.

---

## 8. Settings

Settings are already private by default (behind `requireAuth` + `settings:read`). Net-new is the **opt-in public read**:

- Mark settings public by key/namespace. For **plugin settings** (which have field definitions via `SettingsPageForm`), reuse the same `private?` field marker; the page's stored value exposes only non-private keys publicly. For **arbitrary key/value settings**, a small registry of public keys/prefixes declared in config.
- Public read path: the local `settings.get` under `public` shape (and a future unauthenticated `GET /api/public/settings/:key`) returns only public-marked keys; others resolve to `null`.
- **v1 scope:** confirm private-by-default (done) and ship the `public` marker + public read for plugin settings. The arbitrary-key registry may be a fast follow if needed (§9). Default stays private either way, so nothing leaks in the interim.

---

## 9. Out of scope (seam built, not implemented)

- **Member audiences / frontend auth.** Members-only content is the audience axis with a non-admin authenticated role. Requires frontend auth reusing the Astromech user system. v1 builds the audience filter keyed on role (status is the first case); member audiences add a per-entry/per-type `audience` value + role check. _Dependency: §6 `AudienceContext` already carries `role`._
- **Per-field audience within one entry** (a public page with member-only fields). Deliberately unsupported — it would be a third concept (per-field-per-role), which §2.2 rejects. Workaround: model the gated section as its own `member`-audience entry related into the public page — **which is why §6.3 step 3 must filter populated/related entries by audience**. Without that, the workaround would leak.
- **`preview` shape** (drafts rendered as published for editor preview).
- **Arbitrary-key public settings registry** (if plugin-settings coverage proves insufficient).

## 10. Open questions — RESOLVED during build

1. **Pagination** → path (a): the `status = 'published'` predicate is pushed into the storage `where` for public reads (correct counts). `publishedAt <= now` can't be expressed in `WhereFilters`, so it stays in `applyVisibility` — scheduled-but-future rows may marginally inflate `total`/`pages` (documented in code).
2. **Write-brand** → both shipped: the type-level `__shape` brand AND a runtime `PublicShapeWriteError` guard (a spread copy loses both — accepted edge; direct passthrough is caught).
3. **`full` on the wire** → query param `?full=true` (GET) / `full: true` in body (POST query); re-validated server-side, never trusted.
4. **`ctx.entries` default** → `full` (hooks/cron are privileged RMW). Bare `astromech/local` stays `public`. NB: `ctx.sdk.settings` is **not** full-defaulted — trusted plugin reads of their own settings must pass `{ full: true }` explicitly (see menus SDK).
5. **Permission name** → `entry:read:full`, covered by `entry:*` (editor) and `*` (admin) via the trailing-wildcard matcher; absent for future member/anon roles.

### Original open questions (for history)

1. **Pagination vs row-filtering.** Filtering rows _after_ `storage.list()` makes `pagination.total`/`pages` inconsistent with the page slice. Options: (a) push the status predicate into the storage `where` for `public` reads so DB counts are correct (preferred — `status`/`publishedAt`/`deletedAt` are columns); (b) accept post-filter counts. Lean (a): the audience **status** filter becomes a storage-level `where` clause; the **projection** strip stays in the orchestrator. Confirm and split §6 accordingly.
2. **Write-brand ergonomics.** Validate the §6.4 type brand across real admin call sites (spreads, `Partial`, form payloads). If it produces noisy false-positives, ship runtime-guard-only and drop the type brand.
3. **`full` on the wire — param vs header.** Query param `?full=true` / body `full: true` vs an `X-Astromech-Shape` header. Param is simplest and matches existing `parseQueryParams`; confirm.
4. **`ctx.entries` default.** Confirm hooks/cron want default `full` (privileged RMW context) rather than `public`. Lean full (reduces hook footgun; bare import stays public).
5. **Permission name.** `entry:read:full` vs reusing an existing broad capability. Confirm it composes with `entry:*` / `*` and is absent for future member roles.

---

## 11. Step-by-step implementation plan

Sequenced so each step leaves the tree typechecking/building. **No worktree agents** — the working tree has heavy uncommitted changes; worktrees fork from HEAD and would lose them. Use main-tree coder agents, one interdependent step at a time, verifying `tsc`/`npm run build` between.

### Step 1 — Field marker + read flag + dual-type plumbing (types only)

- `src/types/fields.ts`: add `private?: boolean` to `FieldDefinition`.
- `src/builders/fields.ts`: add `private?` to `BaseOptions` (+ any non-extending options types).
- `src/types/api.ts`: add `full?: boolean` to `EntryQueryParams` and the `get` params; thread into `EntriesApi`.
- `src/types/sdk.ts`: augment the entry-type map with `fieldsPublic`; add `PublicFieldsFor<T>`; add read overloads (public default + `{ full: true }`); type `create`/`update` `data.fields` with the write brand.
- **Verify:** `tsc --noEmit` clean (impl files may break — later steps fix).

### Step 2 — Type generator emits the public variant

- `src/core/type-generator.ts`: emit `${Pascal}FieldsPublic` (skip `private` fields; omit `_disabled`/`_title` on instance types; public relations → related `…FieldsPublic`); add `readonly __shape?: 'public'` to public, write brand alignment to full. Wire both into the generated entry-type map.
- **Verify:** regenerate types in demo; `tsc` clean; eyeball generated `.d.ts`.

### Step 3 — Runtime filter

- New `src/core/visibility.ts`: `applyVisibility` (§6) + `PublicShapeWriteError` + runtime brand helpers.
- `src/sdk/local/entries.ts`: resolve effective shape; apply status predicate via storage `where` for `public` (open Q1); apply projection strip at the query()/get() return seams; recurse through populated relations.
- **Verify:** unit tests in §12; `npm run build`.

### Step 4 — SDK defaults + write guard

- `src/sdk/local/index.ts`: bare `Astromech` default `public`; construct `ctx.entries` with default `full`.
- `src/sdk/fetch/index.ts`: `createEntriesApi` accepts default shape; admin client defaults `full`; send `full` on the wire.
- `create`/`update` (local) reject runtime-branded public values.
- **Verify:** `tsc` clean; admin still reads full.

### Step 5 — HTTP gating + permission

- `src/core/permissions.ts`: add `entry:read:full`.
- `src/api/routes/entries.ts`: parse `full`; capability-gate → 403; pass resolved shape into SDK; stop forwarding raw shape intent.
- **Verify:** curl: authed admin `?full=true` → full; authed admin no flag → public; (simulate) non-capable role `?full=true` → 403.

### Step 6 — Settings public opt-in

- Plugin-settings `private?` marker honoured on read; public settings read returns only public keys; default stays private.
- **Verify:** a non-public setting is absent from a public read.

### Step 7 — Demo + cleanup

- `demo/src/lib/data.ts`: bare `astromech/local` now returns public by default — confirm pages render; pass `{ full: true }` only where SSR legitimately needs internals (likely none).
- Remove the manual `!b._disabled` filter in `demo/src/components/blocks/Blocks.astro:29`.
- `npm run build` + reseed (`npm run db:seed:demo`) + restart dev server (demo loads from `dist/`).

### Step 8 — Docs

- Tick/rewrite `ROADMAP.md:239-245` to the perspective/two-axis model.
- Update `entry-schema-authoring.md` for the `private` field option.
- Update `CLAUDE.md` / skills if read-path guidance changes.
- Memory: note the shape/audience model + write-back guard.

---

## 12. Verification checklist

- [ ] A `private` field is absent from a `public` read and present in `full`.
- [ ] A `_disabled` block/repeater item is absent from `public`, present in `full`; surviving items have no `_disabled`/`_title` keys but keep `_type`/`_id`.
- [ ] A `draft`/`scheduled`-future entry is absent from `public`, present in `full`; pagination totals are correct (open Q1).
- [ ] A populated relationship to a draft / private-field-bearing entry is filtered in `public` (audience composes through populate).
- [ ] `entries.query({ type:'posts' })` returns `TypedEntry<PostsFieldsPublic>`; `{ full: true }` returns `TypedEntry<PostsFields>`.
- [ ] Writing back a public-read value is a compile error (or, if brand dropped, a `PublicShapeWriteError` at runtime).
- [ ] HTTP: authed admin gets `full` with `?full=true`, `public` without; a non-capable role requesting `full` gets **403**.
- [ ] A non-public setting is absent from a public settings read.
- [ ] Demo renders with the manual `!b._disabled` filter removed.
- [ ] `dist/` rebuilt; `tsc --noEmit` clean; test suite green.
