# Storage Drivers

Rework the binary-storage layer: one driver contract that survives S3, video and
Cloudflare; factory-based drivers; and a binding-name seam so one config file
works on Workers, in the Node CLI, and in tests.

**Design spec:** `specs/storage-drivers.md` (locked 2026-07-28). This file tracks
status only.

**Branch:** `feat/storage-drivers` (worktree `.claude/worktrees/feat/storage-drivers`), based on `main` @ 28bcacb.

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

## Sequence (strictly ordered; each step stays green)

### Step 1 — Registry mechanism

- [ ] `defineRegistry<T>(name, { required, hint })` leaf helper; one
      `globalThis.__astromech` namespace instead of eight ad-hoc keys
- [ ] Port all six registries (`storage`, `email`, `database` ×2, `image`, `cron`)
- [ ] Required: `db`, `dbClient`, `dbDriver`, `storage`. Optional (`peek()`):
      `image`, `email`
- [ ] Delete the local `requireStorage()` in `plugins/runtime/plugin-runtime.ts`
- [ ] Drop the `| null` branches at the eight `getStorageDriver()` call sites

### Step 2 — The contract

- [ ] Rewrite `StorageDriver` (spec §4): add `stat`, `get(key, { range })` with
      `totalSize`, paginated `list` → `{ keys, cursor }`, optional `etag`
- [ ] Delete `getDirectUrl`; split into sync `getPublicUrl?` and async
      `getSignedUploadUrl?` / `getSignedDownloadUrl?`
- [ ] Port `filesystem` and `r2` to the new contract
- [ ] `deletePrefix` becomes a cursor loop
- [ ] Tests: `stat` on hit/miss, ranged reads, list pagination

### Step 3 — Factories and packaging

- [ ] `FilesystemStorage` class → `filesystem({ dir, urlPrefix })`
- [ ] One subpath per driver: `astromech/storage/{filesystem,r2,s3}`
- [ ] Remove the storage export from the root `astromech` barrel
      (`src/index.ts:25`) — keeps `node:fs` out of the Workers graph
- [ ] Update `apps/demo/astromech.config.ts`

### Step 4 — S3 driver

- [ ] `s3({ endpoint, bucket, region?, accessKeyId?, secretAccessKey?, publicUrl? })`
- [ ] `@aws-sdk/client-s3` as an optional peer dependency
- [ ] Omitted fields resolve from `S3_*` env vars **on Node only** (documented:
      Workers secrets arrive via `env`, not `process.env`)
- [ ] First implementation of signed upload/download
- [ ] Document that `s3()` against R2's S3 endpoint is the only way to get
      signed uploads on R2 — R2 bindings cannot sign

### Step 5 — Binding resolution

- [ ] `astromech/cloudflare` resolver: `cloudflare:workers` on Workers,
      `getPlatformProxy()` in Node, via a **dynamic** import so Node builds never
      resolve the specifier
- [ ] `r2({ binding })`; lazy resolve-once-and-memoise on first use
- [ ] `wrangler` as a dev/optional dependency — Node-only deploys must not need it
- [ ] Delete the throwing `d1Driver` stub; rebuild `d1({ binding })` on the same seam
- [ ] First real attempt at a Workers boot — expect `initRuntime`'s `process.env`
      write (`kernel/boot.ts:71`) to surface here

### Step 6 — Access modes

- [ ] `media: { access: 'public' | 'private' }`, default `public`
- [ ] `getPublicUrl` wired into media URL generation, falling back to the proxy
      route when a driver has none
- [ ] Boot validation: `access: 'private'` + the Cloudflare Images driver is an
      incompatible pair (CF fetches `originUrl` from its own network)

### Step 7 — Range requests

- [ ] HTTP 206 in `handleMediaRequest` / `serveOriginal`, `Content-Range` from
      `totalSize`
- [ ] Decide whether ranged reads are rejected for variant keys (spec §10)

### Step 8 — Docs

- [ ] `apps/docs/configuration/storage.md` + README index entry, written against
      shipped code

## Deferred

- **Cloudflare Stream** as a separate video delivery driver, sibling to
  `ImageDriver` — plus the media-record schema question it implies (storage key
  vs Stream UID). The general shape is per-media-type delivery drivers alongside
  the single storage driver.
- **Variant prefix separation** so a wholesale variant purge is one `deletePrefix`.
- **Signed access on a custom domain** (WAF HMAC validation, or a Worker
  validating a signed token).
