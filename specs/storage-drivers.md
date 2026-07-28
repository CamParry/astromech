# Storage Drivers — contract, packaging, and cross-runtime binding resolution

**Status:** Design locked 2026-07-28; **steps 1–7 implemented 2026-07-29** on `feat/storage-drivers` (worktree `.claude/worktrees/feat/storage-drivers`, based on `main` @ 28bcacb). This document is the design record and is now behind the code in two places — `roadmap/in-progress/storage-drivers.md` is the as-built status. Delete this file when the branch merges.

**Overruled during implementation:**

1. **§5's `@aws-sdk/client-s3`** — `s3()` is built on **`aws4fetch`** instead. §5 also requires the driver to run on Workers, where the AWS SDK is a poor fit; aws4fetch is ~6kB of SigV4 over `fetch`, identical in both runtimes, and query-signs.
2. **§11 step 5's `d1({ binding })`** — the stub is deleted but the driver is deferred to `roadmap/planned/additional-database-drivers.md`. `DatabaseDriver.getInstance()` is synchronous while binding resolution is async, so it needs a Kysely dialect resolving inside `acquireConnection()`, and no D1 dialect exists in the repo. Do not widen `DatabaseDriver` to work around this.
3. **§7's `src/support/registry.ts`** — landed at `src/utilities/registry.ts`; there is no `support/` directory, and `utilities/` is the pure-leaf home dep-cruiser already enforces.
4. **§8.2's parenthetical that `filesystem()` has no public URL** — it does, but `urlPrefix` had to become opt-in rather than defaulting to `/uploads`, which is only a real URL when `dir` sits under `public/`.
   **Touches:** `packages/astromech/src/storage/**`, `packages/astromech/src/types/config.ts`, `packages/astromech/src/media/**`, every `*/registry.ts`, `packages/astromech/src/database/drivers/d1.ts`, `packages/astromech/src/kernel/boot.ts`, `apps/demo/astromech.config.ts`.
   **Related roadmap:** `in-progress/storage-drivers.md` (status), `planned/multi-runtime-and-framework-adapters.md` (owns the runtime adapter this depends on), `planned/additional-database-drivers.md` (same binding-resolution problem for D1).
   **Related memories:** `project_globalthis_singletons.md`, `integration-config-load-no-virtual.md`, `project_modular_architecture.md`, `project_app_owned_migrations.md`.

> Nothing here is deployed and nothing outside the repo consumes these APIs. Every
> decision below is free to break the existing shape, and several do.

---

## 1. Problem

The storage layer was built for one runtime (Node) and one workload (image
uploads), then had an R2 driver added without revisiting the contract. Concrete
issues found in the 2026-07-28 audit:

- **`getDirectUrl` has zero callers.** Both drivers implement it; nothing in
  `src/` or `apps/` calls it. It is also _sync_ and returns a permanent URL,
  which cannot express a presigned URL.
- **No `stat`.** Probing for an object requires `get`, which opens a body stream
  that is then discarded.
- **No range reads.** `serveOriginal` returns whole bodies, so HTTP 206 is
  impossible and video seeking cannot work.
- **`list(prefix)` is eager and unpaginated**, returning every key as
  `string[]`. Its only consumer is `deletePrefix`. On S3 this is billed per
  request and cannot express a large bucket.
- **Two construction styles.** `FilesystemStorage` is a class exported from the
  root `astromech` barrel — which puts `node:fs` in the barrel Workers code
  imports — while `r2()` is a factory on a subpath.
- **Nullable accessors on required config.** `types/config.ts:316` declares
  `storage: StorageDriver` as _required_, yet `getStorageDriver()` returns
  `StorageDriver | null` and eight call sites branch on it. A missing driver is
  a boot bug being modelled as a per-request data condition.
- **The Workers path has never been run.** `d1Driver()` throws by design
  (`database/drivers/d1.ts:31`), `initRuntime` ends with a `process.env` write
  (`kernel/boot.ts:71`), and there is no Cloudflare adapter. Nothing here is
  known to work off Node.

---

## 2. Terminology (locked)

| Term        | Meaning                                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Driver**  | A pluggable backend for a capability slot — `StorageDriver`, `DatabaseDriver`, `ImageDriver`, `EmailDriver`, `SchedulerDriver`. Supplied by userland config as a value.                                                                  |
| **Adapter** | A host runtime or framework integration — `RuntimeAdapter` (Node, Cloudflare), `FrameworkAdapter` (Astro, SvelteKit, Next). Owns environment concerns such as binding resolution. See `planned/multi-runtime-and-framework-adapters.md`. |

The codebase is already unanimous on "Driver" for capability slots
(`types/config.ts:31–104`); this only writes the distinction down and reserves
"Adapter" for the host layer.

**Ecosystem note:** Payload and EmDash both say "adapter" where we say "driver".
Neither has a runtime-adapter concept — Payload ships per-host _templates_, and
EmDash puts its Cloudflare pieces in a separate package — so neither needed the
word for two jobs. We do. Accepted cost: mild unfamiliarity for people arriving
from those projects.

### Pre-existing naming clash

Top-level `src/storage/` is **binary blob storage** (this spec). `<domain>/storage/`
is the **data-access seam** (see `specs/entries-reshape.md` §2). Unchanged here;
the rename candidate `blob-storage/` stays in the backlog.

---

## 3. Locked decisions

1. **Factories, not classes.** `filesystem({ dir })`, `r2({ binding })`,
   `s3({ ... })`. Matches how the ecosystem declares config values (Astro,
   EmDash, Medusa) and how our own `r2()`/`cloudflareImages()` already work.
   `FilesystemStorage` is deleted, not deprecated.
2. **One driver per capability slot.** No named locations, no multi-bucket
   registry. Directus is the only reference that does this; Medusa explicitly
   forbids it. Plugins keep their prefixed view (`plugin-runtime.ts:451`).
3. **Deferred/per-request driver resolution is out of scope.** It was designed
   against a constraint the platform has since removed (§6).
4. **The globalThis registry stays; the nullable contract goes.** Required
   drivers resolve-or-throw once, with one clear message (§7).
5. **Three media access modes**, chosen by config, not per item (§8).
6. **Presigned URLs are for uploads, not for the R2 download path** (§8.3).
7. **Video ships as bytes + range on R2/S3.** Cloudflare Stream is deliberately
   _not_ a `StorageDriver` and is deferred to the roadmap (§9).

---

## 4. The `StorageDriver` contract

```ts
export type StorageRange = {
    /** Byte offset of the first byte to return. */
    offset: number;
    /** Bytes to return. Omit for "to the end of the object". */
    length?: number;
};

export type StorageObject = {
    body: ReadableStream;
    /** Bytes in `body` — less than `totalSize` for a ranged read. */
    size: number;
    /** Full object size, regardless of range. Needed to emit `Content-Range`. */
    totalSize: number;
    contentType?: string;
    etag?: string;
};

export type StorageStat = {
    size: number;
    contentType?: string;
    etag?: string;
    uploadedAt?: Date;
};

export type StorageList = {
    keys: string[];
    /** Present when more keys remain. Pass back to continue. */
    cursor?: string;
};

export type StorageDriver = {
    name: string;

    // --- required ---
    put(
        key: string,
        body: ReadableStream | Uint8Array,
        opts?: { contentType?: string }
    ): Promise<void>;
    get(key: string, opts?: { range?: StorageRange }): Promise<StorageObject | null>;
    stat(key: string): Promise<StorageStat | null>;
    delete(key: string): Promise<void>;
    list(
        prefix: string,
        opts?: { cursor?: string; limit?: number }
    ): Promise<StorageList>;

    // --- optional capabilities, feature-detected at the call site ---
    /** Permanent, cacheable, CDN-frontable URL. Null when the driver has none. */
    getPublicUrl?(key: string): string | null;
    /** Time-limited upload URL for direct client uploads. */
    getSignedUploadUrl?(
        key: string,
        opts: { expiresIn: number; contentType?: string }
    ): Promise<string>;
    /** Time-limited download URL. */
    getSignedDownloadUrl?(key: string, opts: { expiresIn: number }): Promise<string>;
};
```

### Rationale for each change

- **`stat` replaces an `exists`/`get` probe.** Returning `null` covers existence,
  so no separate `exists`. Directus treats `stat`/`exists` as core; we need only
  one of them.
- **`get` gains `range`, and `StorageObject` gains `totalSize`.** A 206 response
  needs both the slice and the full length for `Content-Range`. Hard requirement
  now that video is in scope.
- **`list` is paginated** and returns an object rather than `string[]`.
  `deletePrefix` (`storage/prefix.ts`) becomes a cursor loop.
- **`getDirectUrl` is deleted and split in two.** `getPublicUrl` is sync and
  means _permanent and cacheable_. Signing is async, expiring, and separate.
  Conflating them is what made the old method unusable and therefore uncalled.
- **`etag` surfaces from the driver.** The media handler currently synthesises
  etags from `media.metadata.version`; drivers that have a real one should be
  able to offer it. Non-breaking — it stays optional and the version-derived
  etag remains the default.

### Capability detection

Optional methods are feature-detected at the call site, never assumed. This is
load-bearing: the R2 **binding** cannot sign URLs at all (§8.3), and
`filesystem()` cannot either.

---

## 5. Drivers and packaging

| Driver       | Import                         | Options                                                                     | Runtime                     |
| ------------ | ------------------------------ | --------------------------------------------------------------------------- | --------------------------- |
| `filesystem` | `astromech/storage/filesystem` | `{ dir, urlPrefix? }`                                                       | Node                        |
| `s3`         | `astromech/storage/s3`         | `{ endpoint, bucket, region?, accessKeyId?, secretAccessKey?, publicUrl? }` | Node + Workers              |
| `r2`         | `astromech/storage/r2`         | `{ binding }` \| `{ bucket }`, `publicUrl?`                                 | Workers (+ Node CLI via §6) |

- **One subpath per driver.** `@aws-sdk/client-s3` is a heavy, Node-flavoured
  optional peer dependency and must never enter the root graph; `filesystem`
  pulls `node:fs`. Neither belongs in a barrel that Workers code imports.
- **The root `astromech` barrel stops exporting any storage driver.** Removing
  `FilesystemStorage` from `src/index.ts:25` is the intended break.
- **`s3()` reads `S3_*` environment variables for any omitted field on Node
  only.** On Workers, secrets arrive via `env`, not `process.env`, so values
  must be passed explicitly. This mirrors EmDash exactly, including the caveat.
- **`s3()` pointed at R2's S3-compatible endpoint is a supported configuration**
  and is the _only_ way to get signed uploads on R2 (§8.3).

---

## 6. Cross-runtime binding resolution

### What changed

`import { env } from 'cloudflare:workers'` makes bindings available at **module
scope**. The only restriction is that Workers forbid _I/O_ outside a request
context — retrieving a binding is fine, calling `.get()`/`.put()` on it at the
top level is not. Drivers only invoke methods at request time, so this never
bites. Separately, Astro 6 **removed** `Astro.locals.runtime.env` and points at
the same import.

So per-request deferral, `(env) => driver` config slots, AsyncLocalStorage, and
`d1Driver({ bindingName })`-as-lifecycle-workaround are all unnecessary. The
`d1.ts` stub gets deleted rather than finished.

### What did not change

`cloudflare:workers` **does not resolve in plain Node**. That matters because
the CLI (`db:generate`, `db:init`) loads the full app config in a plain Node
process — see `project_app_owned_migrations.md`. A Cloudflare-targeted config
containing that import would break every CLI command.

### Resolution: binding names, not binding objects

```ts
storage: r2({ binding: 'MEDIA' }),
db: d1({ binding: 'DB' }),
```

A string resolves in every runtime; an import specifier does not. One config
file then works on Workers, in the Node CLI, and in tests.

This is the shape the `d1Driver({ bindingName })` stub already reached for — but
for the wrong reason. It is correct because of **module resolution across two
runtimes**, not because of request lifecycle.

**Precedent:** EmDash — Cloudflare's own Astro + Workers CMS, also on Kysely —
ships exactly `storage: r2({ binding: "MEDIA" })`. NuxtHub goes further and
fixes names by convention (`DB`, `BLOB`, `KV`).

### Who resolves a binding name

Binding resolution is a **runtime adapter** concern, not a driver concern:

| Context                    | Mechanism                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers                    | `import { env } from 'cloudflare:workers'`                                                                                                                  |
| Node (CLI, scripts, tests) | `getPlatformProxy()` from `wrangler` — emulates the Workers platform in a Node process, reads `wrangler.jsonc`, and shares Wrangler's persistence directory |
| Unit tests                 | miniflare, or a hand-rolled fake driver                                                                                                                     |

Constraints on the implementation:

- The resolver lives behind a subpath (`astromech/cloudflare`) and reaches
  `cloudflare:workers` through a **dynamic** import chosen by runtime
  detection, so a Node build never tries to resolve the specifier.
- `getPlatformProxy()` is async, so the driver resolves its binding **lazily on
  first use and memoises**. Resolve-once-or-throw — nothing per-request.
- `wrangler` is a dev/optional dependency. A Node-only deployment must never
  need it.
- Escape hatch retained: `r2({ bucket })` accepts an already-resolved bucket
  object for anyone who has one.

**Alternative rejected:** per-target config files. It solves the same problem by
duplicating the surface every project must maintain.

**Noted for later, not adopted:** drizzle-kit solves the CLI half by giving the
CLI a _different connection entirely_ — the D1 HTTP API with an account ID and
token (`driver: 'd1-http'`) — while the Worker uses the binding. Worth
revisiting if `getPlatformProxy()` proves awkward.

---

## 7. Registry mechanism

### Decision

Keep `globalThis`. Share the _mechanism_, not the state. Reject a single central
runtime-context object.

### Why not one central global object

Six registries (`storage`, `email`, `database` ×2, `image`, `cron`) are ~20
lines each of identical shape, which is a real pull toward centralising. But a
single object carrying every driver plus its accessors becomes a hub that every
domain imports and that must import every domain's types (`Kysely<DB>`,
`ResolvedConfig`, `ImageDriver`, `SchedulerDriver`…). That is a dependency
magnet in the middle of the deliberate domain/capability/leaf DAG
(`project_modular_architecture.md`), and it directly threatens the constraint
that the Astro integration loads in plain Node and must not pull service modules
(`integration-config-load-no-virtual.md`).

The global itself is not the anti-pattern; the hub is. Note also that the global
is not a taste choice — module-level singletons duplicate across tsup entry
chunks (`project_globalthis_singletons.md`), so a memoised-resolver design would
still need one. It would change the interface over the global, not remove it.

Cloudflare's own guidance supports the current use: mutable _request-scoped_
state must never live in module scope, but write-once immutable initialisation
belongs there. Our registries hold write-once, request-independent driver
objects — the sanctioned category. The design we avoided in §6 (resolving
per-request `env` into a `globalThis` singleton) is precisely the unsafe one.

### The change

A leaf helper, no imports:

```ts
// src/support/registry.ts
export function defineRegistry<T>(
    name: string,
    opts?: { required?: boolean; hint?: string }
): { set(value: T): void; get(): T; peek(): T | null };
```

- One namespace — `globalThis.__astromech` — instead of eight ad-hoc keys.
- `get()` on a required registry throws one consistent message naming the slot
  and the fix. `peek()` is the explicit opt-in for genuinely optional slots.
- Each domain keeps its own registry file and owns its slot. No type hub, DAG
  intact, ~20 lines each collapse to ~3.

### Required vs optional slots

| Slot       | Required | Reason                                                           |
| ---------- | -------- | ---------------------------------------------------------------- |
| `db`       | yes      | Already throws (`database/registry.ts`) — the model for the rest |
| `storage`  | yes      | `types/config.ts:316` declares it non-optional                   |
| `dbClient` | yes      | Already throws                                                   |
| `dbDriver` | yes      | Set from `config.db`, which is required                          |
| `image`    | **no**   | `config.image` is genuinely optional — `peek()`                  |
| `email`    | **no**   | `config.email` is genuinely optional — `peek()`                  |

`plugin-runtime.ts:387` already invented `requireStorage()` locally. This
generalises that and deletes the local copy.

---

## 8. Media access and delivery

### 8.1 Three modes

The axis is not proxy-versus-presigned:

1. **Public direct — the default.** Bucket bound to a custom domain on your
   zone. Permanent, cacheable, CDN-fronted, zero Worker CPU, and Cloudflare
   Image Transformations work.
2. **Worker-proxied — for access-controlled media.** What `handleMediaRequest`
   does today: authorise, then stream from the driver. Costs Worker CPU, which
   is the price of access control.
3. **Signed — for direct client uploads**, bypassing the Worker request-body
   limit, and for S3 deployments.

### 8.2 Config surface

One install-level switch, not per item:

```ts
media: {
    access: 'public' | 'private',   // default: 'public'
}
```

- `public` → media URLs resolve via `driver.getPublicUrl(key)` when the driver
  offers one, falling back to the proxy route when it does not (e.g.
  `filesystem()` in dev).
- `private` → always proxied through `handleMediaRequest`, which authorises
  first. `getPublicUrl` is never consulted.

Astro bakes media URLs into static HTML at build time, so a public URL **must**
be permanent. This is the reason expiring URLs cannot be the default delivery
path — it would also break `og:image`, RSS, and email.

### 8.3 R2 bindings cannot sign

**R2 bindings do not support signed upload URLs**, and R2 presigned URLs work
only on the S3 API domain (`<ACCOUNT_ID>.r2.cloudflarestorage.com`) — **never on
custom domains**. A presigned R2 URL therefore leaves your zone entirely: no
Image Transformations, no zone cache, and it expires.

Consequences:

- `getSignedUploadUrl` / `getSignedDownloadUrl` are **optional** on the
  contract and absent on `r2({ binding })` and `filesystem()`.
- Signed uploads on R2 require `s3()` pointed at R2's S3-compatible endpoint
  with R2 API tokens. "R2" is therefore two configurations depending on whether
  you need signed uploads, and the docs must say so.
- For authenticated access on a custom domain, Cloudflare's own answers are WAF
  HMAC validation (Pro+) or a Worker validating a signed token. Both stay
  on-zone. Neither is in scope here.

### 8.4 Interaction with image optimisation

`media/serving/image/drivers/cloudflare.ts:24` transforms **by URL** —
`fetch(src.originUrl, { cf: { image: { … } } })` — so Cloudflare's network
fetches the origin itself. `originUrl` is built from our own media route.

Therefore **`access: 'private'` and the Cloudflare Images driver are mutually
exclusive** unless the origin route accepts a signed internal request. This must
be a documented, validated-at-boot combination, not something discovered in
production.

Two further facts the contract has to live with:

- **Storage doubles as a variant cache.** On a miss the handler transforms and
  writes `variantStorageKey(id, version, width, format)` back to the same bucket,
  guarded by `!driver.cachesVariants`. One driver serves durable uploads _and_
  regenerable derivatives. `stat` makes probing a variant cheap; variants should
  stay under a purgeable prefix.
- **`getBytes()` buffers the whole original into memory** (`streamToBytes`),
  which defeats the streaming `get` and puts a hard ceiling under Workers'
  memory limit. In practice `sharp` is the Node driver and Cloudflare Images is
  the Workers driver. State it rather than implying it.

---

## 9. Video

R2/S3 give egress-friendly storage but no transcoding and no adaptive bitrate —
whatever was uploaded is what is served. Cloudflare Stream gives transcoding,
HLS/DASH and a player, at roughly 5× the cost, billed per delivered minute.

**Stream is not a `StorageDriver` and must not be forced into one.** It has no
keys: you upload and receive a video UID, then serve via manifest/player URLs.
There is no `get(key) → bytes`, no `list(prefix)`, no byte range.

Decision:

- **v1: video is bytes on R2/S3**, which is what makes `get(range)` and `stat`
  required rather than nice-to-have. HTTP 206 is not optional for video.
- **Future: Stream becomes a separate optional driver in the media domain**,
  sibling to `ImageDriver` — it changes how an item is _delivered_ (returns a
  playback manifest or embed instead of bytes), not where bytes live.
  `ImageDriver.cachesVariants` is the precedent for a driver that says "I own
  delivery, don't write variants to storage."
- The general shape this implies — **per-media-type delivery drivers** beside
  the single storage driver — is noted as a direction, not designed here.
- Implied schema question, deferred with it: a media record needs to know which
  delivery path it is on (storage key vs Stream UID).

---

## 10. Open questions

- ~~**Range + the variant cache.**~~ **Resolved:** ranges apply to originals
  only. `serveOriginal` implements them; a `Range` header on a variant request
  (one carrying `?w`/`?f`) is ignored and the whole image is served.
- ~~**Boot validation.**~~ **Resolved:** config resolution, matched against an
  exported `CLOUDFLARE_IMAGES_DRIVER` constant so renaming the driver cannot
  silently disable the guard.
- **Variant prefix.** Still open. Whether variants move under a dedicated prefix
  so a wholesale purge is one `deletePrefix`, or stay interleaved.
- **`etag` precedence.** Still open. Drivers now surface a real etag but the
  media handler still uses the version-derived one, and nothing consumes the
  driver's.

---

## 11. Implementation sequence

Strictly ordered; each step stays green.

1. **Registry mechanism.** `defineRegistry` leaf + port all six registries +
   required/optional table in §7. Delete the local `requireStorage()`. No
   behaviour change except a clearer throw.
2. **Contract.** Rewrite `StorageDriver` (§4); port `filesystem` and `r2`;
   `deletePrefix` becomes a cursor loop; tests for `stat`, range, and pagination.
3. **Factories and packaging.** Class → function; one subpath per driver; drop
   the root barrel export; update `apps/demo/astromech.config.ts`.
4. **S3 driver.** `@aws-sdk/client-s3` as an optional peer; `S3_*` env
   resolution on Node only; signed upload/download implemented here first.
5. **Binding resolution.** `astromech/cloudflare` resolver (dynamic import +
   `getPlatformProxy()`); `r2({ binding })`; delete the `d1Driver` stub and
   rebuild `d1({ binding })` on the same seam.
6. **Access modes.** `media.access` config; `getPublicUrl` wired into media URL
   generation; boot validation for the Cloudflare Images incompatibility.
7. **Range requests.** 206 in `handleMediaRequest`/`serveOriginal`, with
   `Content-Range` from `totalSize`.
8. **Docs.** `apps/docs/configuration/storage.md` + README index entry — written
   against shipped code, not ahead of it.

Steps 1–4 are runnable and testable on Node today. Step 5 is the first that
needs a Workers path to exist, and is the natural point to find out whether
anything else in `initRuntime` (e.g. the `process.env` write at `boot.ts:71`)
blocks a Workers boot.
