# Typed Entries API

**Status:** Implemented (2026-05-13).
**Supersedes:** N/A — refactor of post-locale-spec SDK surface.
**Touches:** entries SDK (local + fetch), API routes, types, admin hooks, admin pages.

---

## 1. Background & Motivation

The symmetric-locale-model rewrite ([[symmetric-locale-model.md]]) landed in a state with three significant API inconsistencies:

1. **Server routes are type-scoped** (`/entries/:type/:id/...`) but the **fetch SDK exposes id-only signatures** (`entries.update(id, data)`, etc.). To bridge the gap, a `resolveEntryType(id)` helper was added that hits `GET /entries/by-id/:id` *before every* id-only operation — doubling the network round-trips and breaking the moment the by-id route is misordered (we hit that bug on 2026-05-13: Hono matched `/entries/by-id/:uuid` against `/:type/:id` with `type='by-id'`).

2. **The single-entry method `get()` is type-scoped** (`get(type, id)` — commit `0cf0c5a`) while every other id-only method is not. The codebase has a half-finished migration to type-scoped that nobody completed.

3. **A `TypedEntriesProxy` type** (sdk.ts:106-115) was sketched as a future Strapi-style nested accessor (`entries.posts.delete(id)`) but never wired up at runtime. It biases readers toward a design that, after deeper analysis, doesn't fit Astromech well.

This spec consolidates the API around a single, consistent shape. The decisions below were reached through a design discussion captured in chat session 2026-05-13.

---

## 2. Decisions (Locked)

1. **Type is required on every operation.** No id-only methods. No optional-type escapes. The caller must always state which type they're operating on.
2. **Cross-type is only supported on `query`.** All other methods take exactly one type. `query` accepts `type: T | readonly T[]`.
3. **No "all types" sentinel.** Callers wanting all types pass `Object.keys(astromechConfig.entries)` explicitly. Forcing enumeration is a security boundary: it prevents accidental exposure of internal collections in public search/list UIs.
4. **Options-object call shape across the entire surface.** `entries.update({ type, id, data })`, not `entries.update(type, id, data)`. Same shape for every method. Extensible without breaking changes.
5. **Polymorphic `id: string | string[]` for bulk-capable methods.** `trash`, `delete`, `restore`, `publish`, `unpublish`, `schedule`, `update`. Single id → single return; array id → array return.
6. **Bulk operations are all-or-nothing transactional.** Wrapped in a DB transaction including all cascade logic (versions, relationships, locale-group cascades). If any id fails, the whole batch rolls back.
7. **DB-enforced type-on-id sanity check.** Every single-entry op uses `WHERE id = ? AND type = ?` (the pattern `get()` already uses). Mismatched type→id pairs throw with a clear error. Acts as defense-in-depth against caller bugs.
8. **Trash is idempotent.** Re-trashing an already-trashed entry is a no-op, not an error. Cascade-trash that touches the same sibling twice is fine — no union/dedup logic.
9. **Bulk errors throw with offending-id detail.** Error messages include the failing id and the underlying reason. UI shows the partial-failure state to the user.
10. **TypeScript narrowing via literal-type overloads.** `entries.get({ type: 'posts', id })` returns `TypedEntry<PostFields>`; `entries.get({ type, id })` (dynamic) returns wide `Entry`. Same runtime behavior, different static types.
11. **No `searchable` config flag** (type-level). Permissions gate exposure; explicit caller enumeration is the security boundary. Field-level `searchable: true` (which fields are matched by `query({ search })`) is a separate future concern, out of scope here.
12. **Drop `TypedEntriesProxy` from the type system.** Dead code biasing future readers.

---

## 3. SDK Surface

### 3.1 Wide API (`EntriesApi`)

The runtime implementation. Always returns `Entry` / `Entry[]`. Used as the fallback when callers don't supply literal types.

```ts
export interface EntriesApi {
    query(params: {
        type: string | readonly string[];
        locale?: string;
        where?: WhereClause;
        page?: number;
        limit?: number;
        sort?: SortClause;
        search?: string;
        populate?: string[];
    }): Promise<QueryResult<Entry>>;

    get(params: {
        type: string;
        id: string;
        locale?: string;
        populate?: string[];
    }): Promise<Entry | null>;

    create(params: {
        type: string;
        title: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry>;

    update(params: {
        type: string;
        id: string | string[];
        data: Partial<{
            title: string;
            slug: string;
            fields: JsonObject;
            status: EntryStatus;
            publishAt: Date | null;
        }>;
    }): Promise<Entry | Entry[]>;

    duplicate(params: {
        type: string;
        id: string;
        overrides?: Partial<{
            title: string;
            slug: string;
            locale: string;
            localeGroup: string;
            fields: JsonObject;
            status: EntryStatus;
        }>;
    }): Promise<Entry>;

    trash(params: {
        type: string;
        id: string | string[];
        cascadeLocales?: boolean;
    }): Promise<void>;

    restore(params: {
        type: string;
        id: string | string[];
    }): Promise<Entry | Entry[]>;

    delete(params: {
        type: string;
        id: string | string[];
        cascadeLocales?: boolean;
    }): Promise<void>;

    emptyTrash(params: { type: string }): Promise<void>;

    versions(params: { type: string; id: string }): Promise<EntryVersion[]>;
    restoreVersion(params: { type: string; id: string; versionId: string }): Promise<Entry>;

    publish(params: { type: string; id: string | string[] }): Promise<Entry | Entry[]>;
    unpublish(params: { type: string; id: string | string[] }): Promise<Entry | Entry[]>;
    schedule(params: {
        type: string;
        id: string | string[];
        publishAt: Date;
    }): Promise<Entry | Entry[]>;

    incomingRelations(params: { type: string; id: string }): Promise<IncomingRelation[]>;
}
```

### 3.2 Typed API (`TypedEntriesApi`)

Layered overloads in `src/types/sdk.ts`. The runtime is identical to `EntriesApi`; the typed surface adds narrow overloads above the wide ones.

```ts
export type TypedEntriesApi =
    // ── query ──────────────────────────────────────────────────────────────
    {
        query<T extends keyof AstromechEntryTypes>(
            params: { type: T } & Omit<EntryQueryParams, 'type'>
        ): Promise<QueryResult<TypedEntry<FieldsFor<T>>>>;

        query<T extends keyof AstromechEntryTypes>(
            params: { type: readonly T[] } & Omit<EntryQueryParams, 'type'>
        ): Promise<QueryResult<TypedEntry<FieldsFor<T>>>>;

        query(params: { type: string | readonly string[] } & EntryQueryParams):
            Promise<QueryResult<Entry>>;


        // ── get ────────────────────────────────────────────────────────────
        get<T extends keyof AstromechEntryTypes>(
            params: { type: T; id: string } & Omit<QueryOptions, 'type'>
        ): Promise<TypedEntry<FieldsFor<T>> | null>;
        get(params: { type: string; id: string } & QueryOptions):
            Promise<Entry | null>;


        // ── create ─────────────────────────────────────────────────────────
        create<T extends keyof AstromechEntryTypes>(params: {
            type: T;
            title: string;
            slug?: string;
            locale?: string;
            localeGroup?: string;
            fields?: Partial<FieldsFor<T>>;
            status?: EntryStatus;
            publishAt?: Date | null;
        }): Promise<TypedEntry<FieldsFor<T>>>;
        create(params: CreateEntryInput): Promise<Entry>;


        // ── update ─────────────────────────────────────────────────────────
        update<T extends keyof AstromechEntryTypes>(params: {
            type: T;
            id: string;
            data: Partial<{
                title: string; slug: string;
                fields: Partial<FieldsFor<T>>;
                status: EntryStatus; publishAt: Date | null;
            }>;
        }): Promise<TypedEntry<FieldsFor<T>>>;

        update<T extends keyof AstromechEntryTypes>(params: {
            type: T;
            id: readonly string[];
            data: Partial<{
                title: string; slug: string;
                fields: Partial<FieldsFor<T>>;
                status: EntryStatus; publishAt: Date | null;
            }>;
        }): Promise<TypedEntry<FieldsFor<T>>[]>;

        update(params: UpdateEntryInput & {
            type: string; id: string | readonly string[];
        }): Promise<Entry | Entry[]>;


        // ── duplicate ──────────────────────────────────────────────────────
        duplicate<T extends keyof AstromechEntryTypes>(params: {
            type: T;
            id: string;
            overrides?: Partial<{
                title: string; slug: string; locale: string; localeGroup: string;
                fields: Partial<FieldsFor<T>>; status: EntryStatus;
            }>;
        }): Promise<TypedEntry<FieldsFor<T>>>;
        duplicate(params: DuplicateEntryInput): Promise<Entry>;


        // ── lifecycle (publish/unpublish/schedule/restore) ─────────────────
        // Each takes single id → single typed return, array id → array.
        publish<T extends keyof AstromechEntryTypes>(
            params: { type: T; id: string }
        ): Promise<TypedEntry<FieldsFor<T>>>;
        publish<T extends keyof AstromechEntryTypes>(
            params: { type: T; id: readonly string[] }
        ): Promise<TypedEntry<FieldsFor<T>>[]>;
        publish(params: { type: string; id: string | readonly string[] }):
            Promise<Entry | Entry[]>;

        // ...analogous overloads for unpublish, schedule, restore.
    } & Omit<EntriesApi, 'query' | 'get' | 'create' | 'update' | 'duplicate'
            | 'publish' | 'unpublish' | 'schedule' | 'restore'>;
```

### 3.3 Per-method semantics

| Method | Bulk-capable? | Returns | Notes |
|---|---|---|---|
| `query` | N/A (always returns list) | `QueryResult<Entry>` | Cross-type if `type` is array |
| `get` | No | `Entry \| null` | DB enforces `(id, type)` match |
| `create` | No | `Entry` | (bulk-create is a separate future need) |
| `update` | Yes | `Entry` or `Entry[]` | Same `data` applied to all ids |
| `duplicate` | No | `Entry` | Per-entry overrides; loop for bulk |
| `trash` | Yes | `void` | Idempotent; cascade-locales optional |
| `restore` | Yes | `Entry` or `Entry[]` | Per-locale only (never cascades) |
| `delete` | Yes | `void` | Permanent; deletes versions + relationships |
| `emptyTrash` | N/A | `void` | Per-type empty |
| `publish` | Yes | `Entry` or `Entry[]` | |
| `unpublish` | Yes | `Entry` or `Entry[]` | |
| `schedule` | Yes | `Entry` or `Entry[]` | Same `publishAt` for all |
| `versions` | No | `EntryVersion[]` | Per-entry only |
| `restoreVersion` | No | `Entry` | Per-entry only |
| `incomingRelations` | No | `IncomingRelation[]` | Per-entry only |

### 3.4 Type-mismatch behavior

When `id` exists in the DB but its `type` column doesn't match the supplied `type` param:

- **Reads** (`get`): returns `null` (consistent with "not found").
- **Mutations** (`update`, `trash`, `delete`, `duplicate`, `publish`, `unpublish`, `schedule`, `restore`, `restoreVersion`): throw `EntryTypeMismatchError` with both expected and actual types in the message.

This is enforced via `WHERE id = ? AND type = ?` in the local SDK queries and via server-side validation in the fetch SDK path.

### 3.5 Bulk semantics

- **Atomicity**: each call wraps in `db.transaction(async (tx) => ...)`. Includes cascade logic (locale group cascades, version cleanup, relationship cleanup). If any id fails any validation or write, the entire transaction rolls back.
- **Order**: ids are processed in array order; the first failure is the one reported.
- **Errors**: thrown errors include `{ failedId: string, reason: string, succeededBefore: string[] }`. UI can display "deleted 2 of 5, failed on id X because Y."
- **Permission**: type-level permission is checked once (caller's role can `entry:delete:posts`). Per-id row permission (if ever implemented) iterates inside the transaction.
- **Empty arrays**: `id: []` is a no-op success (no transaction, returns `[]` or `void`).

---

## 4. HTTP API

All routes type-scoped. The `/by-id/:id` route is removed. The fetch SDK no longer does any pre-flight type lookups.

### 4.1 Routes

| Method | Path | Body | SDK call |
|---|---|---|---|
| `POST` | `/entries/query` | `{ type: string[], ... }` | `query({ type: [...], ... })` (cross-type) |
| `POST` | `/entries/:type/query` | `{ ... }` | `query({ type: 'posts', ... })` (single) |
| `GET` | `/entries/:type` | — | `query({ type: 'posts' })` (simple list) |
| `GET` | `/entries/:type/:id` | — | `get({ type, id })` |
| `POST` | `/entries/:type` | create body | `create({ type, ... })` |
| `PUT` | `/entries/:type/:id` | update body | `update({ type, id, data })` (single) |
| `POST` | `/entries/:type/bulk-update` | `{ ids, data }` | `update({ type, id: [...], data })` |
| `POST` | `/entries/:type/:id/duplicate` | overrides | `duplicate({ type, id, overrides })` |
| `DELETE` | `/entries/:type/:id` | — | `trash({ type, id })` (single) |
| `POST` | `/entries/:type/bulk-trash` | `{ ids, cascadeLocales? }` | `trash({ type, id: [...] })` |
| `DELETE` | `/entries/:type/:id/force` | — | `delete({ type, id })` (single) |
| `POST` | `/entries/:type/bulk-delete` | `{ ids, cascadeLocales? }` | `delete({ type, id: [...] })` |
| `POST` | `/entries/:type/:id/restore` | — | `restore({ type, id })` (single) |
| `POST` | `/entries/:type/bulk-restore` | `{ ids }` | `restore({ type, id: [...] })` |
| `POST` | `/entries/:type/:id/publish` | — | `publish({ type, id })` (single) |
| `POST` | `/entries/:type/bulk-publish` | `{ ids }` | `publish({ type, id: [...] })` |
| `POST` | `/entries/:type/:id/unpublish` | — | `unpublish({ type, id })` (single) |
| `POST` | `/entries/:type/bulk-unpublish` | `{ ids }` | `unpublish({ type, id: [...] })` |
| `POST` | `/entries/:type/:id/schedule` | `{ publishAt }` | `schedule({ type, id, publishAt })` |
| `POST` | `/entries/:type/bulk-schedule` | `{ ids, publishAt }` | `schedule({ type, id: [...], publishAt })` |
| `DELETE` | `/entries/:type/trash` | — | `emptyTrash({ type })` |
| `GET` | `/entries/:type/:id/versions` | — | `versions({ type, id })` |
| `POST` | `/entries/:type/:id/versions/:versionId/restore` | — | `restoreVersion({ type, id, versionId })` |
| `GET` | `/entries/:type/:id/incoming-relations` | — | `incomingRelations({ type, id })` |

### 4.2 Removed routes

- `GET /entries/by-id/:id` — the `resolveEntryType` workaround. Deleted.

### 4.3 Route ordering

In `src/api/routes/entries.ts`, register more-specific routes before more-general ones. Specifically: any `/entries/query` (no `:type`) handler must be registered **before** `/entries/:type/...` handlers, since Hono matches in registration order. (This is the bug class that caused the `/by-id` issue.)

---

## 5. Removed / Deleted

- `GET /entries/by-id/:id` route and handler.
- `resolveEntryType()` helper in `src/sdk/fetch/index.ts`.
- All 11 `await resolveEntryType(id)` call sites in the fetch SDK.
- `TypedEntriesProxy` type and `TypedEntryTypeApi` type in `src/types/sdk.ts` (dead code).
- Any references to `searchable` at the type-config level (none currently exist; just confirming none will be added).

---

## 6. Step-by-Step Implementation Plan

Sequenced so each step leaves the codebase typechecking.

### Step 1 — Types (`src/types/api.ts`, `src/types/sdk.ts`)

- Rewrite `EntriesApi` interface to options-object shape (§3.1).
- Rewrite `TypedEntriesApi` overload set (§3.2).
- Delete `TypedEntriesProxy` and `TypedEntryTypeApi` types.
- Update any helper types (`CreateEntryInput`, `UpdateEntryInput`, `DuplicateEntryInput`, etc.) used by both wide and typed surfaces.
- Add `EntryTypeMismatchError` class to `src/types/errors.ts` (or wherever errors live).
- Add `EntryQueryParams.type: string | readonly string[]` (was `type?: string`).
- Audit `CascadeLocalesOption` — it becomes a property on the options object, not a separate options param.

**Verify:** `tsc --noEmit` clean. Implementation files will break — that's expected; Step 2/3 fix them.

### Step 2 — Local SDK (`src/sdk/local/entries.ts`)

- Rewrite every method signature to options-object shape.
- Add `WHERE type = ?` to `update`, `trash`, `delete`, `duplicate`, `restore`, `publish`, `unpublish`, `schedule`, `restoreVersion`, `incomingRelations`, `versions` (anywhere we read by id).
- Wrap each bulk-capable method body in `db.transaction(async (tx) => ...)` (or whatever drizzle SQLite uses; verify the API). Pass `tx` through to repository calls and cascade helpers.
- Implement bulk variants:
  - `trash({ type, id: string[] })` — iterate, soft-delete each, cascade locales per id if requested.
  - `delete({ type, id: string[] })` — iterate, hard-delete each with version + relationship cleanup, cascade locales per id.
  - `restore({ type, id: string[] })` — iterate; return `Entry[]`.
  - `publish` / `unpublish` / `schedule` — iterate, update status / publishedAt / publishAt; return array.
  - `update({ type, id: string[], data })` — iterate, apply same data to each; return array. Skip slug auto-suffix logic when `data.slug` is supplied (would fight uniqueness across ids — throw if `slug` in `data` for bulk).
- On any failure, throw an error of shape `{ failedId, reason, succeededBefore }`; transaction will roll back automatically.
- Empty `id: []` → return `[]` (or void) without opening a transaction.

**Verify:** `npm run build` (tsup) clean. Existing admin call sites will break — that's expected; Step 5 fixes them.

### Step 3 — Fetch SDK (`src/sdk/fetch/index.ts`)

- Mirror every method signature change from Step 2.
- **Delete `resolveEntryType()` function and all 11 call sites.**
- For bulk routes, construct paths like `/entries/${type}/bulk-${action}`.
- For cross-type query (`type` is array), call `POST /entries/query`; for single-type, call `POST /entries/:type/query`.

**Verify:** `tsc --noEmit` clean.

### Step 4 — API routes (`src/api/routes/entries.ts`)

- Move `POST /entries/query` registration **before** `/entries/:type/query` to avoid the same route-shadowing class of bug we hit with `/by-id`.
- Delete `GET /entries/by-id/:id` handler.
- Add `POST /entries/query` handler — validates body, calls `Astromech.entries.query({ type: [...], ... })`.
- Add bulk-route handlers (`bulk-trash`, `bulk-delete`, `bulk-restore`, `bulk-publish`, `bulk-unpublish`, `bulk-schedule`, `bulk-update`). Each parses body, validates `ids` array, calls the SDK's bulk variant.
- Update Zod schemas for the request bodies (add `BulkActionSchema`, etc.).
- Update OpenAPI route definitions where applicable.
- Permission checks: bulk routes check the type-level permission (e.g., `entry:trash:posts`) once at the route level — same as single-entry equivalents.

**Verify:** `curl` smoke tests on each new route.

### Step 5 — Admin hooks (`src/admin/hooks/entries.ts`)

Update every call site to the options-object shape. Approximate before→after:

```ts
// Before
Astromech.entries.update(id, payload)
Astromech.entries.trash(id, cascadeOpts)
Astromech.entries.delete(id, cascadeOpts)
Astromech.entries.duplicate(id)
Astromech.entries.restore(id)
Astromech.entries.publish(id)
Astromech.entries.unpublish(id)
Astromech.entries.schedule(id, publishAt)
Astromech.entries.versions(id)
Astromech.entries.restoreVersion(id, versionId)
Astromech.entries.incomingRelations(id)

// After
Astromech.entries.update({ type, id, data: payload })
Astromech.entries.trash({ type, id, ...cascadeOpts })
Astromech.entries.delete({ type, id, ...cascadeOpts })
Astromech.entries.duplicate({ type, id })
Astromech.entries.restore({ type, id })
Astromech.entries.publish({ type, id })
Astromech.entries.unpublish({ type, id })
Astromech.entries.schedule({ type, id, publishAt })
Astromech.entries.versions({ type, id })
Astromech.entries.restoreVersion({ type, id, versionId })
Astromech.entries.incomingRelations({ type, id })
```

- Hooks that receive only an `id` (e.g., `useTrashEntry(id)`) need to accept `type` too. Most callers already know `type` from route params or list-page state.
- Bulk hooks (`useBulkTrashEntries`, `useBulkDeleteEntries`, `useBulkPublishEntries`, `useBulkUnpublishEntries`):
  - Change from `Promise.all(ids.map(id => entries.trash(id)))` loops to single `entries.trash({ type, id: ids })` calls.
  - All become atomic.
  - Error handling: surface `failedId` and `reason` in toast.

**Verify:** `tsc --noEmit` clean for admin code.

### Step 6 — Admin pages

Update direct SDK call sites:

- `src/admin/pages/_protected/entries/$type/$id/index.tsx` — `Astromech.entries.update(id, data)` → `Astromech.entries.update({ type, id, data })`. `type` is already in scope from `useParams()`.
- Any other `Astromech.entries.*` calls in pages or components — grep and update.

### Step 7 — Tests

- Update any existing tests that use the old call shape.
- Add tests for:
  - Type-mismatch behavior (`get` returns null for wrong type; mutations throw `EntryTypeMismatchError`).
  - Bulk transactional atomicity (force a failure on id #3 of 5; verify ids #1 and #2 are also rolled back).
  - Empty bulk (`id: []`) is a no-op.
  - Cross-type `query({ type: ['posts', 'pages'] })` returns rows of both types with correct narrowing.
  - `query({ type: 'posts' })` and `query({ type: ['posts'] })` both work and return identical results.

Note: existing tests have harness limitations (per locale-spec gotchas — `getDb()` / `virtual:astromech/config` don't resolve under bare vitest). Same constraints apply. Manual smoke via demo Astro server remains the primary verification.

### Step 8 — Cleanup

- Grep `Astromech.entries\.` for stragglers using old positional shape.
- Grep `resolveEntryType` — should be zero hits.
- Grep `/by-id` — should be zero hits.
- Grep `TypedEntriesProxy` / `TypedEntryTypeApi` — zero hits.
- Update ROADMAP.md to note this work landed.
- Update CLAUDE.md or `specs/symmetric-locale-model.md` if there are stale references to id-only SDK calls.

---

## 7. Verification Checklist

After implementation:

- [ ] Every `Astromech.entries.*` method takes a single options object.
- [ ] `type` is required on every method (TS error if omitted).
- [ ] `entries.get({ type: 'posts', id })` narrows return to `TypedEntry<PostFields> | null` (once `AstromechEntryTypes` is augmented).
- [ ] `entries.get({ type: 'wrong-type', id })` returns `null` even if `id` exists under a different type.
- [ ] `entries.update({ type: 'wrong-type', id, data })` throws `EntryTypeMismatchError`.
- [ ] `entries.trash({ type, id: ['a', 'b', 'c'] })` either trashes all three or none (atomicity).
- [ ] `entries.trash({ type, id: 'a' })` already-trashed → no-op success.
- [ ] `entries.query({ type: ['posts', 'pages'], search: 'foo' })` returns rows of both types.
- [ ] `entries.query({ type: 'posts' })` and `entries.query({ type: ['posts'] })` return equivalent results.
- [ ] No `resolveEntryType` references in the codebase.
- [ ] No `GET /entries/by-id/:id` route.
- [ ] No `TypedEntriesProxy` / `TypedEntryTypeApi` types.
- [ ] Admin list-page bulk actions (trash, delete, publish, unpublish) complete in a single SDK call each.
- [ ] Bulk failure surfaces `failedId` to the user.
- [ ] `dist/` rebuilt (`npm run build`) — demo Astro server picks up changes.

---

## 8. Out of Scope (Future Work)

- **Field-level `searchable: true`** — declaring which fields participate in `query({ search })`. Default-false per field. Performance characteristics (FTS5? LIKE? trigram?) TBD. Tracked separately.
- **`searchable` at the type/collection level** — declarative "this collection appears in public search UI" metadata. Not enforced by SDK; would be caller-facing affordance only. Not in v1.
- **Bulk `create`** — `entries.create({ type, data: [...] })` for seeding. Defer until concrete need.
- **Cross-type bulk operations** — e.g., `entries.trash({ id: ['post-a', 'page-b'] })`. Caller loops over types for now.
- **Per-id partial-success bulk mode** — `{ atomic: false }` option that completes whatever succeeds and returns `{ succeeded, failed }`. Not in v1; atomic is the default and only mode.
- **`find({ id })` escape hatch** — id-only lookup with type discovery. Not needed if callers always have type; revisit if a concrete use case emerges.

---

## 9. Open Questions (Resolve During Build)

1. **Bulk HTTP path style.** Spec uses `POST /entries/:type/bulk-{action}`. Alternative: `POST /entries/:type/{action}` with the body discriminating by `ids` vs `id`. Either works; prefer the explicit `bulk-` prefix for grep-ability.
2. **`update` slug behavior in bulk.** Throwing on `data.slug` for bulk update (because shared slug → uniqueness violation across N ids) is the proposed behavior. Confirm during impl: throw clearly, or silently skip the slug field?
3. **Drizzle transaction API for SQLite.** Verify `db.transaction(async (tx) => ...)` is the call shape; confirm the cascade-helper functions (`deleteByEntry`, version-deletion, etc.) accept an optional `tx` parameter so they're tx-aware.
4. **OpenAPI definitions** for the bulk routes. Hand-write the route descriptors or skip — the codebase already uses `createRoute` from `@hono/zod-openapi` for some routes but not all. Match prevailing style.
5. **Error class location.** `EntryTypeMismatchError` — does it live in `src/types/errors.ts`, a new file, or co-located with `EntriesApi`? Match the codebase's existing error-class convention.
