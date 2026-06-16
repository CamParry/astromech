# Image Optimisation

**Status:** Implemented (2026-06-16) on `feature/image-optimisation`. Shipped **Node (Sharp) and Cloudflare (Images) drivers simultaneously** to lock the driver shape from day one. Build order §10 steps 1–5 complete; deferred items remain (see §10 "Open later").
**Supersedes (in part):** ROADMAP "Image Optimisation" 🚧 (Sharp / Cloudflare Images / responsive variants / store variants in media record) — this design replaces "store variants in media record" with on-demand generation + storage-driver write-back, and reframes the storage driver as a bytes-only backend.
**Touches:** `src/types/config.ts` (`StorageDriver` rework + `list`; new `ImageDriver`; `image` config; `mediaRoute`), `src/db/schema.ts` (drop persisted `url`; add `metadata` JSON), `src/types/domain.ts` (`Media`), `src/sdk/local/media.ts` (upload orchestration + lifecycle cleanup + dimension/placeholder extraction), `src/storage/{filesystem,registry}.ts` (+ new `src/storage/drivers/r2.ts`), new `src/images/*` (core URL builder, allowlist, request handler, `<Image>` core), new image drivers (`@astromech/sharp`, Cloudflare in the CF path), `src/core/config-resolver.ts` (defaults: `mediaRoute`, `defaultImageWidths`, `avif`), `src/core/route-registration.ts` + `src/adapters/astro.ts` (mount `mediaRoute`), `src/api/routes/media.ts` (upload still funnels through the service).
**Related:** [[unified-architecture.md]], [[plugin-architecture.md]], [[scheduler-and-backups.md]] (shares `StorageDriver.list`), ROADMAP "Storage Drivers" (R2/S3), "Multi-Runtime & Framework Adapters" (Node/Next).

---

## 1. Background & Motivation

Today media is a single funnel: `Astromech.media.upload(file)` → `driver.upload(file, path)` → insert a `mediaTable` row whose `url` column stores an absolute/static URL (`/uploads/<uuid>.<ext>` for `FilesystemStorage`). All file types land in the same place; there is no optimisation and no responsive delivery. The `width`/`height` columns exist but nothing populates them.

The goal: serve modern, responsive, optimised images (AVIF/WebP, multiple widths) **without** the WordPress problem (pre-baking dozens of variants most of which are never requested) and **without** running a poorly-configured Node deployment into a large compute/bandwidth bill. The CMS targets **Astro + Cloudflare first**, but must run on a **Node server with Sharp** too — so the optimisation engine is a swappable **driver**, like storage and the database.

This was validated by research into how real CMSs (Sanity, Strapi, Payload, Directus, Supabase, Cloudflare, Cloudinary, imgproxy) serve media — see §9.

---

## 2. Terminology (Ubiquitous Language)

The codebase already distinguishes **driver** (a swappable backend for a capability, chosen in config — `StorageDriver`, `DatabaseDriver`, `EmailDriver`, `SchedulerDriver`, and the per-runtime `src/cron/drivers/*`) from **adapter** (the framework/host integration layer — `src/adapters/astro.ts`, future Next/SvelteKit). Runtime-coupling does **not** make something an adapter; the cron drivers are per-runtime yet still drivers.

| Term                  | Role                        | Media-aware? | Examples                        |
| --------------------- | --------------------------- | ------------ | ------------------------------- |
| **Framework adapter** | mounts routes into the host | —            | `src/adapters/astro.ts`         |
| **Storage driver**    | moves bytes by key          | **No**       | filesystem, R2, S3              |
| **Image driver**      | transforms image bytes      | **No**       | `sharp()`, `cloudflareImages()` |
| **Media service**     | app logic / lifecycle       | **Yes**      | `src/sdk/local/media.ts`        |

"Image optimisation **driver**" / `ImageDriver` — never "image adapter."

---

## 3. Decisions (Locked)

1. **Canonical, app-owned media URL.** Every media item is served from one Astromech-owned route, not from the storage backend's native URL. Bare URL = original; image query params = optimised variant. Same URL shape across all drivers → the `<Image>` component is portable and content stays put when you swap storage backends.
2. **Storage driver demoted to a bytes-only backend.** `put` / `get` / `delete` / `list` by key — no concept of `File`, media, mime, or images. (`get`/`put` are stream-oriented; never buffer whole files into memory.) An optional `getDirectUrl(key)` exposes a static fast-path.
3. **`upload` stays — at the service layer.** `media.upload(file)` becomes orchestration over the bytes driver: type-detect, extract metadata for images, `driver.put`, insert row. Domain logic lives once for every backend.
4. **`media.url` is no longer persisted.** It is derived at read time as `${mediaRoute}/${id}.${ext}`. Swapping storage never rewrites stored content.
5. **On-demand transforms, not eager pre-baking.** Variants are generated on first request and cached (storage write-back on Node; edge cache on Cloudflare). Avoids WordPress-style variant sprawl and the stale-breakpoint problem.
6. **Allowlisted variants, safe-by-default.** The server only produces variants whose `w` is in a configured allowlist and whose `f` ∈ {avif, webp}; anything else 404s/redirects. This is the primary guard against compute/bandwidth abuse on a no-CDN Node box.
7. **Transform vocabulary = `w` × `f` only.** `w` (width, the only per-image axis, = the allowlist), `f` (`avif`|`webp`, automatic & site-level). **Dropped:** `quality` (baked per-format default), `h` + `fit` (art-directed crops — deferred together), `f=auto` (component emits explicit `<picture>` sources instead), `dpr` (folded into width), JPEG/PNG output (AVIF/WebP both carry alpha; WebP is the universal fallback).
8. **Responsive via `sizes` (authored) + auto width ladder (generated).** `srcset` width descriptors describe the files; `sizes` describes the layout. Developer writes `sizes`; the component generates the width ladder (= the allowlist), capped at the intrinsic width (never upscale).
9. **Portable component = framework-agnostic core + thin renderer.** A pure `buildImageAttrs()` returns `<picture>`/`<img>` attrs as plain data; the Astro `<Image>` renders it. Next/React renderers later reuse the core. Astro-only for now.
10. **Image optimisation is a driver** (`ImageDriver`), configured via `image: { driver, widths, avif }`. `widths` + `avif` are **policy** shared by the handler _and_ the component, so they live alongside the driver, not inside it.
11. **Media is type-aware; only raster images optimise.** Videos/PDFs/other are first-class (stored, served), but never transformed. The optimise path gates on raster bitmap types (jpeg/png/webp/avif/heic/tiff). **SVG** → always served as-is (vector); **animated GIF** → served as-is for v1.
12. **Versioned URLs for safe immutable caching.** Variant URLs carry `v=<short content hash | updatedAt>` from the record. Correct `v` → served + `immutable`. Stale/wrong/missing `v` → **302 to the current canonical URL**. Keeps one-URL-one-bytes; no CDN cache pollution; replace-in-place busts cleanly.
13. **Lifecycle cleanup is the media service's job.** Both drivers are media-blind. The service derives `variants/<id>/` and purges it (via `list` + `delete`) on delete and replace. No orphans, no DB bookkeeping of variant keys.
14. **`mediaRoute` is core config**, default `/_media`, top-level (not under `/admin` or `/api`), mounted by the framework adapter via its own `injectRoute` (like the auth route). Leading-underscore = framework-internal convention (cf. `/_next/image`, `/_image`).

---

## 4. The URL & Serving Model

### 4.1 Shape

```
${mediaRoute}/<id>.<ext>                         → original (shareable, ETag + revalidate)
${mediaRoute}/<id>.<ext>?w=640                   → no v: 302 → canonical
${mediaRoute}/<id>.<ext>?w=640&f=webp&v=<ver>    → canonical variant (immutable)
```

- **Bare original** — the friendly shareable link. Served directly from the storage driver (stream), `ETag` + revalidation + moderate `max-age` so a replaced image stays correct. Used for downloads, `<a>`, non-image media, and the `<picture>` `<img>` fallback (or the fallback may point at a canonical WebP variant).
- **Params without `v`** — a human/shared URL. The handler fills in the default format and **302s to the canonical** versioned URL.
- **Canonical variant** — what the component emits. `Cache-Control: public, max-age=31536000, immutable`.

### 4.2 Handler flow (core, runtime-agnostic)

```
GET ${mediaRoute}/<id>.<ext>[?w&f&v]
  load media record by id (404 if missing)
  no image params           → serve original bytes (stream) + ETag/revalidate
  has params:
    validate w ∈ allowlist, f ∈ {avif,webp}      → else 404
    v missing/stale/wrong                          → 302 → canonical (correct v, default f)
    item not an optimisable raster image           → serve original (ignore params)
    variantKey = `variants/<id>/<v>/<w>.<f>`
    storage.get(variantKey) HIT                    → stream back + immutable
    MISS → driver.transform(src, {width,format})
           unless driver.cachesVariants: storage.put(variantKey, bytes)
           respond + immutable
```

On Cloudflare the edge cache fronts this so the Worker rarely runs the MISS branch; `cachesVariants: true` skips the redundant R2 write.

---

## 5. Contracts

### 5.1 StorageDriver (reworked — bytes only)

```ts
type StorageDriver = {
    name: string;
    put(
        key: string,
        body: ReadableStream | Uint8Array,
        opts?: { contentType?: string }
    ): Promise<void>;
    get(
        key: string
    ): Promise<{ body: ReadableStream; size: number; contentType?: string } | null>;
    delete(key: string): Promise<void>;
    list(prefix: string): Promise<string[]>; // required; trivial on fs/R2/S3; powers variant cleanup + backups
    getDirectUrl?(key: string): string | null; // optional static fast-path
};
```

A core `deletePrefix(driver, prefix)` helper = `list` + `delete` loop (drivers don't reimplement it).

### 5.2 ImageDriver (new)

```ts
type ImageSource = {
    contentType: string;
    getBytes(): Promise<Uint8Array>; // Sharp path
    originUrl: string; // Cloudflare path (publicly-fetchable original)
};

type ImageDriver = {
    name: string;
    transform(
        src: ImageSource,
        opts: { width: number; format: 'avif' | 'webp' }
    ): Promise<{ body: ReadableStream | Uint8Array; contentType: string }>;
    placeholder?(bytes: Uint8Array): Promise<string | null>; // blurhash; optional capability
    cachesVariants?: boolean; // true (CF) → skip storage write-back
};
```

- **`sharp()`**: `transform` reads `src.getBytes()` → `sharp(buf).resize(width).toFormat(format)`. `placeholder` decodes to ~32px raw → blurhash encode (cheap). `cachesVariants` falsey.
- **`cloudflareImages()`**: `transform` = `fetch(src.originUrl, { cf: { image: { width, format } } })`. `cachesVariants: true`. `placeholder` optional (WASM codec or omit — decide when building).

`buildUrl` is **not** on the driver — it's a core function (URLs are identical across drivers).

### 5.3 Image config

```ts
import { defaultImageWidths } from 'astromech';

image: {
  driver: sharp(),                         // or cloudflareImages()
  widths: [...defaultImageWidths, 2400],   // extend via spread, or replace wholesale; deduped+sorted; = allowlist
  avif: true,                              // site-wide format toggle (AVIF encode is slower)
}
```

---

## 6. Data Model

`mediaTable` / `Media`:

- **Drop** persisted `url` (derive it).
- **Keep** `width` / `height` as columns (queryable; populated at upload via a pure-JS header reader — works on every runtime incl. Workers, no full decode).
- **Add** a `metadata` JSON column for system-extracted data — **distinct from the existing `fields`** (which is user-defined `MediaConfig.fields`). Holds: `blurhash`, EXIF orientation, video duration, PDF page count, and the content `version` (or derive `v` from `updatedAt`).

### 6.1 Upload orchestration (`media.upload(file)`)

```
id = uuid; ext = …; key = `${id}.${ext}`
if isOptimisableImage(mime):
  { width, height } = readDimensions(headerBytes)     // pure JS, all runtimes
  blurhash = await image.driver.placeholder?(bytes)   // if capability present
driver.put(key, file.stream(), { contentType: mime })
insert row { id, filename, mimeType, size, width, height, metadata: { blurhash, version, … } }
```

### 6.2 Lifecycle (media service)

- **delete(id)**: `driver.delete(key)`; `deletePrefix(driver, 'variants/<id>/')`; delete row.
- **replace(id, file)**: new `version`; `driver.put` new bytes; `deletePrefix` old `variants/<id>/`; update row → new `v` busts caches.

---

## 7. Responsive Component

- **Core**: `buildImageAttrs(media, { sizes, widths? }, imageConfig)` → `{ sources: [{ type, srcset }], img: { src, width, height }, blurhash? }`. Generates the avif/webp `srcset` ladders from `widths` (capped at intrinsic width), the derived URLs (with `v`), and intrinsic dims. Framework-agnostic.
- **Astro `<Image src sizes alt />`**: thin renderer → `<picture>` + `<img>` (with `width`/`height` for zero CLS, optional blur-up from `blurhash`). `sizes` defaults to `100vw`. Images only; videos/PDFs use their bare `/_media/...` URL.

Example: a half-width image → `<Image src={entry.hero} sizes="50vw" alt="…" />`.

---

## 8. Abuse / Cost Mitigations (on by default)

Driven by §9 research — every documented blow-up came from _unbounded transforms_ with mitigations shipped _disabled_. Ours ship enabled:

- **Allowlisted `w` + fixed `f` enum** → finite, fully-cacheable variant space (cf. Cloudinary Strict Transformations).
- **Stream, never buffer** originals/transforms (the Next.js CVE-2026-44577 class: load-whole-image-into-memory → OOM).
- **Immutable + versioned variant URLs** → a variant transforms once, then cache forever.
- **Storage write-back** (Node) so repeat misses don't re-transform.
- **Future / optional:** signed-URL escape hatch for arbitrary widths (for CDN-fronted deploys), bounded transform concurrency + 429 load-shedding on constrained hosts (cf. Directus ≤1GB guidance).

---

## 9. Research Summary (2026-06-16)

20 sources, 25 claims adversarially verified (0 killed). Key findings:

- **Static vs handler is genuinely mixed.** Static originals: Sanity (`cdn.sanity.io`), Strapi local (`koa-static`), Cloudflare R2 ref-arch. Handler-proxied: Payload (for file access-control), Directus (`/assets`), Supabase (→ Imgproxy on miss). Proxying is mainstream when you want access-control or on-the-fly transforms.
- **On-demand dominates** (Sanity/Directus/Supabase/Cloudflare). Eager pre-baking is the minority (Payload `imageSizes`, Strapi 156/500/750/1000) — and Strapi's own docs note breakpoint changes only apply to _new_ uploads (the stale-variant problem).
- **The cost risk is the transform, not the original.** Next.js CVE-2026-44577: image optimiser "fetches local images entirely into memory without enforcing a maximum size limit" → OOM; self-hosted vulnerable, Vercel not. Directus: transforms memory-heavy, lower concurrency on ≤1GB hosts.
- **Mitigations exist but ship disabled** (imgproxy signing off + unlimited queue; Cloudinary Strict opt-in). Lesson: ship them **on**.
- **Bare-original + query-param-variant + CDN is a validated pattern** (Cloudflare, Sanity). Nuance: Cloudflare's native syntax is path-based, so our query-param routing is an app-owned choice serviced by the Worker — consistent with the canonical-URL decision.

Caveat: mostly first-party vendor docs + one security advisory; no independent benchmarks; WordPress/Ghost/Craft/Statamic/Contentful/Drupal not primary-sourced.

---

## 10. Build Order

1. **Core, driver-agnostic**: `StorageDriver` rework (+ `list`, stream `get`/`put`, `deletePrefix` helper); migrate `FilesystemStorage`; schema migration (drop `url`, add `metadata`); derive `url`; `media.upload` orchestration; pure-JS dimension extraction; `mediaRoute` config + default; mount the route; handler (validate/allowlist/version/serve-original/cache check + write-back); lifecycle cleanup.
2. **Image drivers + config**: `ImageDriver` type; `image: { driver, widths, avif }`; `defaultImageWidths`; `sharp()` (transform + blurhash placeholder); `cloudflareImages()` (`cf.image`, `cachesVariants`).
3. **Component**: `buildImageAttrs` core + Astro `<Image>` (srcset/sizes/picture/dims/blur-up).
4. **R2 storage driver** (`src/storage/drivers/r2.ts`) for the Cloudflare path.
5. **Migration**: existing rows lose persisted `url`; demo config (`storage`, new `image`); update ROADMAP.

Open later (explicitly deferred): art-directed crops (`h`+`fit`), signed-URL escape hatch, transform concurrency caps, ThumbHash vs BlurHash choice, Next/Vercel `<Image>` renderer + native `/_next/image` mapping, S3 driver.
