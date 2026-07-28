# Storage

One storage driver per install, set as `storage` in your config. It holds media
originals and the image variants generated from them — there is no second
bucket.

```ts
import { defineConfig } from 'astromech';
import { filesystem } from 'astromech/storage/filesystem';

export default defineConfig({
    storage: filesystem({ dir: './public/uploads', urlPrefix: '/uploads' }),
    // …
});
```

## Choosing a driver

| Driver         | Import                         | For                                                                | Runs on                                |
| -------------- | ------------------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `filesystem()` | `astromech/storage/filesystem` | local development and single-server Node deployments               | Node only                              |
| `r2()`         | `astromech/storage/r2`         | Cloudflare Workers with an R2 bucket binding                       | Workers; Node via wrangler (see below) |
| `s3()`         | `astromech/storage/s3`         | any S3-compatible endpoint — AWS S3, MinIO, Backblaze, R2's S3 API | Node and Workers                       |

Each driver has its own subpath. There is no root barrel export, so importing
`filesystem` never pulls `node:fs` into a Workers bundle.

## `filesystem()`

```ts
filesystem({ dir: './public/uploads', urlPrefix: '/uploads' });
```

| Option      | Required | What it is                                         |
| ----------- | -------- | -------------------------------------------------- |
| `dir`       | yes      | absolute or cwd-relative directory to write into   |
| `urlPrefix` | no       | public URL prefix at which `dir` is already served |

`urlPrefix` has no default, deliberately. Without it `getPublicUrl` returns
`null` and every file is served through the media route, which is correct and
works everywhere. Setting it is an **assertion** — "whatever is at `dir` is
already being served at this path" — and nothing can verify that for you. Point
it at a directory your web server doesn't serve and you get 404s for every
image.

The demo's pairing is the safe shape: `dir: './public/uploads'` with
`urlPrefix: '/uploads'`, because Astro serves `public/` at the site root.

`filesystem()` cannot sign URLs; `getSignedUploadUrl` / `getSignedDownloadUrl`
are absent from it entirely.

## `r2()`

```ts
import { r2 } from 'astromech/storage/r2';

storage: r2({ binding: 'MEDIA', publicUrl: 'https://cdn.example.com' });
```

| Option      | Required | What it is                                            |
| ----------- | -------- | ----------------------------------------------------- |
| `binding`   | one of   | name of the R2 bucket binding in your wrangler config |
| `bucket`    | one of   | an already-resolved R2 bucket object                  |
| `publicUrl` | no       | base URL for `getPublicUrl`, with no trailing slash   |

Pass exactly one of `binding` or `bucket`. R2 buckets have no public URL by
default: without `publicUrl` (an `r2.dev` subdomain, or a custom domain bound to
the bucket) `getPublicUrl` returns `null` and objects are served through the
media route.

### Why a binding _name_ and not the bucket

One `astromech.config.ts` is loaded by two different runtimes: the Worker, and
the CLI (`db:generate`, `db:init`, scripts, tests) in plain Node. Bindings come
from `import { env } from 'cloudflare:workers'`, and that specifier does not
resolve in Node at all — a config that imported it would break every CLI
command. A string resolves in both.

So the name is resolved lazily, on **first use**, not at construction, and the
result is memoised. Constructing the driver in a Node process therefore always
succeeds; a bad binding name surfaces on the first read or write:

```
[Astromech] Cloudflare binding 'MEDIA' not found. Available bindings: DB, ASSETS.
Check the `bindings` section of your wrangler config.
```

Resolving a binding outside a Worker needs **wrangler installed as a
devDependency and a `wrangler.jsonc` present** — that's how CLI and test runs
get an emulated binding. Without it, the first use fails with a message saying
so. Nothing needs wrangler until something actually touches storage.

`r2({ bucket })` remains available for callers that already hold a resolved
binding, e.g. `r2({ bucket: env.MY_BUCKET })` inside a Worker.

## `s3()`

```ts
import { s3 } from 'astromech/storage/s3';

storage: s3({
    endpoint: 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com',
    bucket: 'media',
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    publicUrl: 'https://cdn.example.com',
});
```

| Option            | Required | Env fallback (Node only) | Default  |
| ----------------- | -------- | ------------------------ | -------- |
| `endpoint`        | yes      | `S3_ENDPOINT`            | —        |
| `bucket`          | yes      | `S3_BUCKET`              | —        |
| `accessKeyId`     | yes      | `S3_ACCESS_KEY_ID`       | —        |
| `secretAccessKey` | yes      | `S3_SECRET_ACCESS_KEY`   | —        |
| `region`          | no       | `S3_REGION`              | `'auto'` |
| `publicUrl`       | no       | `S3_PUBLIC_URL`          | none     |

**The environment fallback is Node-only.** On Workers there is no
`process.env`; secrets arrive through the binding `env`, so on Workers every
value must be passed explicitly. The environment is read defensively, so
constructing the driver never throws — a missing value is only reported on first
use, and the error names both the option and the variable.

Addressing is path-style throughout (`<endpoint>/<bucket>/<key>`). R2's S3
endpoint and MinIO require it and AWS accepts it, so one form covers every
target; virtual-host style is not supported.

## Media access modes

```ts
export default defineConfig({
    // …
    media: { access: 'private' }, // default: 'public'
});
```

- **`public`** (default) — a media record's `url` is the driver's own URL when
  the driver offers one, falling back to the media route when it doesn't. That
  fallback is what keeps `filesystem()` in dev and `r2()` without a `publicUrl`
  working unchanged.
- **`private`** — `getPublicUrl` is never consulted; every original is served
  through the media route. Note what this is and isn't: it stops direct storage
  URLs being handed out, so access _can_ be gated at the route — the media route
  does not itself check permissions today.

Two things people get wrong:

**A public URL must be permanent.** Astro bakes these strings into static HTML at
build time, and the same strings end up in `og:image`, RSS and email. Nothing
expiring may be handed out here — which is why presigned URLs are an upload
path, never the delivery path.

**Image variants always go through the media route, whatever the access mode.**
A variant is generated on demand on a cache miss, so a direct storage URL would
404 until something happened to produce it. Only the original ever gets a direct
URL.

## Signed URLs, and the R2 trap

Signing is optional on the driver contract and feature-detected at the call
site. That detection is load-bearing, not politeness: `filesystem()` and
`r2({ binding })` genuinely have no `getSignedUploadUrl` / `getSignedDownloadUrl`
at all. Never assume the methods exist.

**An R2 binding cannot sign.** And R2's presigned URLs only work on the S3 API
domain, `<ACCOUNT_ID>.r2.cloudflarestorage.com` — never on a custom domain. So a
presigned R2 URL leaves your zone entirely: no Image Transformations, no zone
cache, and it expires.

The consequence is that **"R2" is two different configurations**:

- serving media from R2 → `r2({ binding: 'MEDIA', publicUrl })`;
- signed direct-to-bucket uploads on R2 → `s3()` pointed at
  `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` with R2 API tokens.

Nothing in the core issues signed URLs today — admin uploads are posted to the
API and streamed to the driver. The capability is there for your own code.

## `private` + Cloudflare Images is rejected

`media.access: 'private'` and the `cloudflare-images` image driver cannot
coexist, and the combination throws at config resolution rather than failing in
production:

```
[Astromech] `media.access: 'private'` cannot be combined with the
`cloudflare-images` image driver: it transforms by URL, so Cloudflare's network
must be able to fetch your media route, which a private route refuses. Either
set `media.access: 'public'`, or use a different image driver (e.g. `sharp()`).
```

That driver hands your own media-route URL to Cloudflare's network and lets
Cloudflare fetch the origin. A private route is exactly what refuses that
request, so every optimised image would fail at the edge.

## Range requests

Originals are served with `Accept-Ranges: bytes` and answer a `Range` header
with a `206` and a `Content-Range` built from the object's total size; an
unsatisfiable range gets a `416`. This is what makes video seeking work, and it
is why `stat` and ranged `get` are required parts of the driver contract rather
than nice-to-haves. There is nothing to configure. Variants are images, served
whole, and ignore `Range`.

## Writing your own driver

A driver is a plain object. Five methods are required:

```ts
import type { StorageDriver } from 'astromech';

export function myDriver(options: MyOptions): StorageDriver {
    return {
        name: 'my-driver',
        async put(key, body, opts) {},
        async get(key, opts) {
            return null;
        },
        async stat(key) {
            return null;
        },
        async delete(key) {},
        async list(prefix, opts) {
            return { keys: [] };
        },
    };
}
```

- `get` returns `null` for a missing key; `delete` on a missing key is a no-op,
  not an error.
- `list` is paginated: return a `cursor` **only when more keys remain**, and
  accept it back as `opts.cursor`. Order must be stable across calls or the
  cursor means nothing.
- Optional: `getPublicUrl(key)` (return `null` when there isn't one),
  `getSignedUploadUrl`, `getSignedDownloadUrl`. Omit what you can't do — callers
  feature-detect, and a method that throws is worse than an absent one.

The non-obvious rule is in the `StorageObject` you return from `get`:

```ts
{ body, size, totalSize, contentType?, etag? }
```

**`size` is the number of bytes in `body`; `totalSize` is the size of the whole
object.** They differ on a ranged read, and `Content-Range` is built from
`totalSize`. Getting this wrong is easy because R2 reports the full size on a
ranged read while an HTTP `content-length` reports the slice — the drivers
derive each field separately for exactly that reason.

Resolve nothing expensive in the factory. The same config module is imported by
the CLI in plain Node, where construction must always succeed; do credential and
binding resolution lazily on first use and memoise it.
