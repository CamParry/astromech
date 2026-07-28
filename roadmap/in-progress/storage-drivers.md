# Storage Drivers

Rework the binary-storage layer: one driver contract that survives S3, video and
Cloudflare; factory-based drivers; and a binding-name seam so one config file
works on Workers, in the Node CLI, and in tests.

**Design spec:** `specs/storage-drivers.md` (locked 2026-07-28). This file tracks
status only.

**Branch:** `feat/storage-drivers` (worktree `.claude/worktrees/feat/storage-drivers`), based on `main` @ 28bcacb.

**Status:** all eight steps done and green (typecheck, lint, 1192 tests, build),
unmerged. Nothing has been run on Cloudflare — see Known gaps and Not verified
before treating this as finished.

## Locked direction

- **Driver** = pluggable backend for a capability slot. **Adapter** = host
  runtime/framework integration. Written down, not re-litigated.
- **Factories, not classes** — `filesystem({ dir })`, `r2({ binding })`, `s3({…})`.
- **Deferred/per-request resolution is out of scope** — `import { env } from
'cloudflare:workers'` works at module scope, and Astro 6 removed
  `locals.runtime.env` in favour of it.
- **Binding names, not binding objects** — a string resolves in every runtime, an
  import specifier does not. Matches EmDash (Cloudflare's own Astro+Workers CMS).
- **globalThis registry stays; the nullable contract goes** — required drivers
  resolve-or-throw once. A central runtime-context object is rejected as a
  dependency hub.
- **Three access modes** — `public` (direct, default) / `private` (Worker-proxied);
  signing is for uploads, not the R2 download path.
- **Video is bytes + range on R2/S3.** Cloudflare Stream is not a `StorageDriver`.

## Sequence

### Step 1 — Registry mechanism ✅

- [x] `defineRegistry<T>(name, { required, hint })` leaf helper; one
      `globalThis.__astromech` namespace instead of eight ad-hoc keys
- [x] Port all six registries (`storage`, `email`, `database` ×2, `image`, `cron`)
- [x] Required: `db`, `dbClient`, `dbDriver`. Optional (`peek()`): `image`,
      `email`, `scheduler`, `cronJobs`
- [x] Delete the local `requireStorage()` in `plugins/runtime/plugin-runtime.ts`
- [x] Drop the `| null` branches at the `getStorageDriver()` call sites

Landed in `src/utilities/registry.ts`, not `src/support/` — there is no
`support/` directory, and `utilities/` is already the pure-leaf home enforced by
dep-cruiser's `leaves-are-pure` rule.

The required/optional distinction is enforced by an **overload pair**: `get()`
does not exist on a registry declared `required: false`, so an optional slot
cannot later be made to throw by accident. `clear()` was added for the binding
resolver's dispose/reset paths.

Deliberately NOT ported (caches, accumulators and process-local flags, not driver
slots): `entries/storage/registry.ts`, `transport/cli/virtual-config-shim.ts`,
`plugins/runtime/entry-access.ts`, the plugin-runtime state, `email-overrides.ts`,
`cron/runner.ts`, `cron/drivers/node.ts`.

### Step 2 — The contract ✅

- [x] Rewrite `StorageDriver`: `stat`, `get(key, { range })` with `totalSize`,
      paginated `list` → `{ keys, cursor }`, optional `etag`
- [x] Delete `getDirectUrl`; split into sync `getPublicUrl?` and async
      `getSignedUploadUrl?` / `getSignedDownloadUrl?`
- [x] Port `filesystem` and `r2` to the new contract
- [x] `deletePrefix` becomes a cursor loop; `listAll` added for callers that
      genuinely need every key (this is how plugins keep their `string[]` view)
- [x] Tests: `stat` on hit/miss, ranged reads, list pagination

### Step 3 — Factories and packaging ✅

- [x] `FilesystemStorage` class → `filesystem({ dir, urlPrefix })`
- [x] One subpath per driver: `astromech/storage/{filesystem,r2,s3}`
- [x] Remove the storage export from the root `astromech` barrel
- [x] Update `apps/demo/astromech.config.ts`

`filesystem.ts` moved to `storage/drivers/` to sit beside its siblings.

### Step 4 — S3 driver ✅

- [x] `s3({ endpoint, bucket, region?, accessKeyId?, secretAccessKey?, publicUrl? })`
- [x] Omitted fields resolve from `S3_*` env vars **on Node only**
- [x] First implementation of signed upload/download
- [x] Document that `s3()` against R2's S3 endpoint is the only way to get
      signed uploads on R2 — R2 bindings cannot sign

**Built on `aws4fetch`, not `@aws-sdk/client-s3`** (spec §5 overruled, decision
2026-07-29). The spec also requires `s3()` to run on Workers, where the AWS SDK
is a poor fit; aws4fetch is ~6kB of SigV4 over `fetch`, identical in both
runtimes, and query-signs. Path-style addressing only — R2 and MinIO require it,
AWS accepts it.

### Step 5 — Binding resolution ✅ (D1 deferred)

- [x] `astromech/cloudflare` resolver: `cloudflare:workers` on Workers,
      `getPlatformProxy()` in Node, via a **dynamic** import
- [x] `r2({ binding })`; lazy resolve-once-and-memoise on first use
- [x] `wrangler` stays a non-dependency — a Node-only deploy must not need it;
      its absence throws an actionable message
- [x] Delete the throwing `d1Driver` stub
- [ ] ~~Rebuild `d1({ binding })`~~ → **moved to
      `roadmap/planned/additional-database-drivers.md`.** `getInstance()` is
      synchronous while binding resolution is async, so it needs a Kysely dialect
      resolving inside `acquireConnection()`, and no D1 dialect exists here.
- [ ] First real attempt at a Workers boot — **not done**, see Not verified

`external` in tsup turned out not to be what keeps `cloudflare:workers` out of a
Node bundle; only the non-literal `import(spec)` indirection is, because esbuild
cannot statically resolve a variable specifier. Verified against built output.

### Step 6 — Access modes ✅

- [x] `media: { access: 'public' | 'private' }`, default `public`
- [x] `getPublicUrl` wired into media URL generation, falling back to the proxy
      route when a driver has none
- [x] Boot validation: `access: 'private'` + the Cloudflare Images driver is an
      incompatible pair

Policy lives in one function (`resolveMediaUrl` in `media/service.ts`). Variant
URLs stay on the media route in **both** modes — a variant is generated on demand
on a cache miss, so a direct storage URL would 404.

`filesystem()`'s `urlPrefix` became opt-in as a consequence: it used to default
to `/uploads`, which is only a real URL if `dir` sits under `public/`. Harmless
while `getDirectUrl` had no callers; a 404 generator once access modes consult it.

### Step 7 — Range requests ✅

- [x] HTTP 206 in `serveOriginal`, `Content-Range` from `totalSize`, 416 for an
      unsatisfiable range, `Accept-Ranges` on every response
- [x] Spec §10 resolved: ranges apply to **originals only**. Variants are images
      and are served whole; a `Range` on a variant request is ignored.

Suffix ranges (`bytes=-N`) are supported. Multi-range is ignored in favour of a
whole-object 200.

### Step 8 — Docs ✅

- [x] `apps/docs/configuration/storage.md` + README index entry

## Known gaps

Found by reading the shipped code while writing the docs. All documented
honestly on the docs page rather than papered over.

- **`access: 'private'` is not access control.** It only stops a direct storage
  URL being handed out; `src/routes/media-handler.ts` forwards to
  `handleMediaRequest` with no permission check, so the media route still serves
  any valid media id to anyone. Private is the _prerequisite_ for authorising
  media — bytes behind a route we own — not the authorisation. Deciding what
  authorisation means here is its own piece of work: public sites need
  unauthenticated images, so it cannot simply be a session check.
- **Signed URLs have no consumer.** `getSignedUploadUrl`/`getSignedDownloadUrl`
  exist only on `s3()` and nothing in `src/` or the admin calls them — uploads
  are still multipart POSTs to `/media/upload`. Direct client upload is a
  separate feature; the capability is in place for it.
- **`disposeBindings()` is exported but never called.** Its own doc comment says
  a Node process that resolved a binding will not exit until it runs, so the
  first CLI command against an R2-backed config will hang. Nothing exercises it
  yet (the demo uses `filesystem()`); it needs wiring into CLI teardown.
- **`s3()` maps HTTP 403 to null on `get`/`stat`** — correct for a missing key
  in a bucket without `ListBucket`, but it also makes bad credentials or a bad
  bucket policy present as "media not found" rather than an error.
- **`filesystem().list` re-walks and re-sorts the whole tree per page**, so
  `listAll`/`deletePrefix` over a large directory are quadratic. Acceptable for
  a dev driver, which is all it claims to be.

## Not verified

- **Nothing has been run on Cloudflare.** Both real binding-detection branches
  (`cloudflare:workers` on Workers, `getPlatformProxy()` in Node) are untested:
  there is no `wrangler` install and no `wrangler.jsonc` in this repo. Tests
  cover the `setBindingEnv` bypass and the error surfaces only.
- **`initRuntime` still ends with a `process.env` write** (`kernel/boot.ts`),
  which a Workers boot will trip over. Expected to surface with the runtime
  adapter — see `roadmap/planned/multi-runtime-and-framework-adapters.md`.
- **The S3 driver has never been run against a real endpoint.** Its tests stub
  `fetch` and assert on the signed `Request`.

## Deferred

- **Cloudflare Stream** as a separate video delivery driver, sibling to
  `ImageDriver` — plus the media-record schema question it implies (storage key
  vs Stream UID). The general shape is per-media-type delivery drivers alongside
  the single storage driver.
- **Variant prefix separation** so a wholesale variant purge is one `deletePrefix`.
- **Signed access on a custom domain** (WAF HMAC validation, or a Worker
  validating a signed token).
- **`etag` precedence** — driver-supplied vs version-derived when both exist. The
  media handler still uses the version-derived etag; drivers now surface a real
  one but nothing consumes it yet.
