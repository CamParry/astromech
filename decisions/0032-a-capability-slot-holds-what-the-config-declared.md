# 0032 — A capability slot holds what the config declared

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** 0031 in part (its count of the strips in `resolveConfig`)

Every capability the host plugs in now follows one rule, in two halves.

> A capability that is **one shared resource for the whole app** is declared in
> config and reached from its registry, never off the config. Behaviour attached
> to **one entity** stays where it was declared.
>
> A slot holds what the config declared for that capability, normalised and
> defaulted, with nothing copied in from another config key.

The shared resources are `db`, `storage`, `email`, `media.image`, `ai`,
`scheduler`, `plugins`, and per-type `entries[].storage`.

## The second half is not a loophole

`validate`, `hooks`, `access`, an entry type's `url` template, a field's
`condition` and an admin page's `component` are all declared in config, read from
the resolved config at call time, and never reach a registry. That is right, not
an omission. Each is policy about one entity, and a registry exists to arbitrate
between competing claims on a resource that only one thing can own. There is
nothing here to arbitrate. Two entry types' `validate` functions do not compete
for anything; two callers and one connection pool do.

Only shared resources move.

## Why the slot, when the config is a live module

The question is reasonable and the answer is not about the drivers. Every driver
is already a self-contained lazy object: `r2()` resolves its binding on first use
because a resolved bucket is not reachable from Node
(`packages/astromech/src/storage/drivers/r2.ts`), and `libsqlDriver()` memoises
`getInstance()`. Nothing about them needs boot to make them usable, so with
`virtual:astromech/config` now the author's own module
([0030](0030-the-server-loads-the-config-as-a-module.md)), `config.storage.put(…)`
looks like it should just work.

Two things stop it.

**The config module is not importable from everywhere core runs.** Core executes
in four import graphs: the Vite SSR graph, the plain-Node graph the Astro
integration loads through jiti at config time
(`packages/astromech/src/boot/astro.ts`), the CLI, and vitest.
`virtual:astromech/config` resolves only in the first.
`packages/astromech/src/cron/runner.ts` reads the resolved config from a registry
for exactly this reason, and `packages/astromech/src/transport/cli/virtual-config-shim.ts`
exists for it. A direct import would work under SSR and break `db:generate`.

**The config module evaluates twice under `astro dev`.** Measured during
`roadmap/completed/runtime-boot-and-live-config.md`, not assumed. Module-level
state is not shared between the two copies; `globalThis` is. A driver memoising a
connection in module scope would hold two pools in dev and one in production,
which is the worst shape a bug of that kind can take.

A third reason, smaller but daily: tests swap drivers constantly, and
`setStorageDriver(fake)` is one line where module mocking is a fixture.

## What reassembly cost

The registry was never the defect. Boot's reassembly was.
`setEmailConfig({ driver, from })` and
`setImageConfig({ driver, widths, avif, mediaRoute })` took a self-contained
driver and glued values onto it from elsewhere in the config. That is what made
the slots inconsistent in kind: across seven of them a slot held a live instance
(`db`), the driver that produced it (`dbDriver`), a driver alone (`storage`), a
driver plus a value copied from another key (`email`, `image`), a transformed
thing (`ai`) or the whole resolved config (`runtimeConfig`). The accessor names
reported it honestly: `getDb()` and `getStorageDriver()` named a thing,
`getEmailConfig()` and `getImageConfig()` named a config.

Only two values were glue, and each went a different way.

`from` moved into the email driver's factory. It is the envelope sender, both
call sites — `packages/astromech/src/users/auth.ts` and the plugin email port —
passed it straight through to `send()`, and no caller ever chose a different one.
So `EmailMessage` drops the field, each driver supplies its own from the options
it was constructed with, and the slot holds an `EmailDriver` and nothing else.

`mediaRoute` was deleted rather than moved. Its two readers
(`packages/astromech/src/media/serving/handler.ts` and
`packages/astromech/src/media/serving/image/Image.astro`) already import the
resolved config the value was copied from.

The rule this leaves is deliberately **not** "a slot holds only the driver". A
capability may legitimately have core policy beside its driver, and `media.image`
does.

## `media.image = { driver, widths, avif }`

Three flatter shapes were live before this, and each lost for its own reason.

**`image: sharp({ widths, avif })`** — rejected. The width list is core's guard,
not the driver's preference: the media route returns 404 for a width it will not
serve (`isAllowedWidth` in `packages/astromech/src/media/serving/handler.ts`), and
an allowed miss transforms and then `put`s the result into storage. Without the
allow-list, any `?w=` an attacker types mints and stores a new object. Pushing it
into `sharp()` means swapping `sharp()` for `cloudflareImages()` moves a site's
DoS guard along with it, which is not a thing a driver swap should do.

**`media: { widths, avif }`** — rejected, and this is the shape the roadmap
originally specified. Widths are image policy, not media policy. A video has a
bitrate ladder and no width list at all; a PDF has page thumbnails. Hoisting
`widths` to `media` makes it claim to describe media it cannot describe, and the
first non-image transform would have to either ignore it or reinterpret it.

**A root `image:` beside a future root `video:`** — rejected. Image handling is a
sub-capability of media, not an app-wide one, and the signatures say so:
`Image.astro` takes `src: Media`, and `buildImageAttrs`
(`packages/astromech/src/media/serving/image/build-image-attrs.ts`) takes
`{ id, filename, mimeType }`. The pipeline only ever operates on a stored media
record. Contrast `storage`, which stays at config root because it also backs
`ctx.storage` and `@astromech/backups`, and `db`, which backs everything.

Nesting pays for itself twice over. `widths` reads correctly as bare `widths`
once it sits under `media.image`, and `assertMediaAccessCompatible` in
`packages/astromech/src/boot/config-resolver.ts` — which refuses
`media.access: 'private'` with the Cloudflare Images driver — stops being an
assertion across two unrelated config keys.

The prior art is unanimous, which is the strongest argument for the shape:

- Astro — `image: { service, domains, remotePatterns }`
- Next — `images: { loader, deviceSizes, imageSizes, formats }`
- Strapi — `upload: { provider, providerOptions, breakpoints }`
- Directus keeps the storage driver and `ASSETS_TRANSFORM_PRESETS` apart, with the
  presets belonging to the core product rather than to the driver

Every one pairs the transform driver with the variant policy in a single object
keyed by media kind. None flattens the ladder up to the parent, and none pushes
it down into the driver.

## Naming the driver factories

**Lowercase factory, over the two other styles that were live.** Email drivers
were exported classes needing `new` and carrying a `Driver` suffix; scheduler
drivers were pre-built singleton objects. The factory won because it was already
the majority (`filesystem()`, `r2()`, `s3()`, `sharp()`, `cloudflareImages()`,
`d1()`, `libsqlDriver()`) and because it is the only one of the three that can
defer work: `r2()` has to resolve its binding on first use, since a resolved
bucket is not reachable from the plain-Node graph the config is loaded in.

**`consoleEmail()`, not `console()`.** `console()` is unusable rather than merely
unclear: importing that binding into a config file shadows `globalThis.console`
and breaks any logging in the file. `logEmail()` was the real alternative —
Laravel's mail driver for this is `log` and Django's is the console backend — and
it lost to the word that says what the thing does. Payload calls its equivalent
`consoleEmailAdapter`.

**`interval()`, `webhook()`, `cloudflareCron()`, not `node()`, `http()`,
`cloudflare()`.** The host-named set describes where the process happens to run
rather than what triggers a tick, and `cloudflare()` is ambiguous standing beside
`r2()`, `d1()` and `cloudflareImages()` — all four are Cloudflare, and only one
of them is a scheduler. `nodeScheduler()`/`httpScheduler()`/`cloudflareScheduler()`
was the other candidate: self-describing at the import, verbose at the call site,
and redundant under a key already spelled `scheduler:`. `interval()` and
`webhook()` return drivers whose `name` matches the export; `cloudflareCron()`
keeps `name: 'cloudflare'`, naming the platform the trigger comes from.

All six email and scheduler drivers now have published subpaths
(`astromech/email/*`, `astromech/scheduler/*`). The scheduler subpaths are named
for the `scheduler` config key rather than for `src/cron/`, which holds jobs and
due-evaluation as well as triggering. Before this, core exported no scheduler
driver at all, so `scheduler:` could not be selected from outside the package.

## Driver against port

The distinction is load-bearing now that email has both. A **driver** is what the
host configures into a capability slot. A **port** is the narrow handle a plugin
receives, and it is a different type on purpose:
[0007](0007-plugin-core-boundary.md) is why a plugin cannot reach the driver, and
[0008](0008-plugin-methods-port.md) is the pattern.

`ctx.email.send(to, subject, element)` stays a port rather than the raw
`EmailDriver` for two reasons. It renders the React element to html and text, so
a plugin touches neither `EmailMessage` nor the renderer; and it throws when the
site has configured no email driver, rather than resolving as if the message
went.

It does **not** apply a template override, and cannot. `registerEmailOverride`
(`packages/astromech/src/email/email-overrides.ts`) keys overrides by name, and a
plugin hands the port a bare `ReactElement` with no name attached. The roadmap
claimed it did; a later reader would otherwise go looking for code that is not
there.

## What this does to 0031

[0031](0031-the-plugin-config-view-is-an-allow-list.md) weighed adding `storage`,
`email` and `image` to `resolveConfig`'s strip list and rejected it. Read
carefully: it rejected the strip list **as an alternative to** the `Pick`, on the
grounds that a strip list leaves the default for a newly-added field as "visible
to every plugin".

This work did both, which is not a reversal. The `Pick` in
`packages/astromech/src/types/plugins.ts` remains the barrier, and the strips went
from four to six, which is exactly the defence in depth 0031 itself endorsed ("The
four strips stay, as defence in depth rather than as the barrier"). `ResolvedConfig` is
now `Omit<AstromechConfig, 'db' | 'storage' | 'email' | 'scheduler' | 'ai' | 'plugins'>`
— the registry-held capabilities, plus `plugins` for the live functions on a raw
`PluginDefinition[]`. What changed is the reason: the six are stripped because
each is reached from its registry, not because a plugin must not see them.

0031's sentence "`storage`, `email` and `image` are not on it" still describes the
`Pick` accurately. What is no longer true is that they are on `ResolvedConfig`.
`media.image` is stripped from `ResolvedMediaConfig` separately, and that strip is
load-bearing rather than tidiness: `media` is picked whole by `makeConfigView`, so
without it a live `ImageDriver` rides into every plugin's `ctx.config.media`.

`packages/astromech/tests/boot/config-resolver-strips-drivers.test.ts` covers the
runtime destructure, which nothing exercised. A spread into an object literal
typed `ResolvedConfig` does not trip excess-property checking, so deleting the
strip compiled and passed the whole gate.

## Deliberate exceptions, and what was left

- **`ai` holds a transformed thing.** `buildAIConfig` wraps each configured model
  in logging middleware, so the slot does not hold what the config declared. That
  is core policy applied once at boot rather than reassembly from another config
  key, and there is nowhere else for it to run
  ([0031](0031-the-plugin-config-view-is-an-allow-list.md) records why
  `resolveConfig` cannot do it). A noted exception, not a fix.
- **`db` keeps its instance/driver split**, the only capability with one: `setDb`
  takes the `Kysely` and `setDatabaseDriver` retains the driver beside it, because
  `ctx.database` feature-detects `dump`/`restore` off the driver.
- **`ctx.db` is still the raw `Kysely`**, the remaining outlier under the port
  rule, and it is what makes `ctx.storage`'s `plugin/<alias>/` key prefix a
  convention rather than a boundary — a plugin holding raw Kysely already reaches
  every core table. Deferred rather than accepted: `@astromech/backups` and
  `@astromech/assistant` both lean on it hard, and narrowing it is a design
  question rather than a rename.
- **No `media.video`.** `media.image` gives one an obvious home, which is a
  consequence rather than a reason. A video driver is not symmetric with an image
  driver: Cloudflare Stream stores the bytes itself and returns an HLS manifest,
  which breaks the invariant that `storage` is the single blob store for every
  media byte. That is a storage question, and guessing the shape now is what a
  speculative slot would be doing.
- **`avif: boolean` stays a boolean.** Next's `images.formats` generalises better
  and the one reader already maps the boolean to `['avif', 'webp']`, but a format
  list needs negotiation order defined, and this decision is about where a
  capability is declared rather than what it declares.
- **Host `entries[].storage` was declared and then ignored** — the same rule one
  level down. `resolveConfig` narrowed a host type's capabilities from its
  storage's `supports` while nothing ever mounted that storage, so
  `supports: ['statuses']` silently disabled slug, trash, versioning, staging and
  translations on a type built-in storage handles fine. The registration loop goes
  after `registerPlugins`, which opens by clearing every override.
  `packages/astromech/tests/boot/init-runtime.test.ts` drives the real
  `initRuntime` rather than the test harness: the harness mirrors the boot
  sequence, so a test built on it cannot fail when the loop moves or goes.
- **`titleField` stays `'title' | false`.** The check in
  `packages/astromech/src/entries/storage/capabilities.ts` rejects anything else
  unconditionally, which is correct — only the error message promising that custom
  storage would admit a custom field name was wrong. Widening it would have to
  reach `createEntrySchemaFor`, `EntryRecord.title`, `EntryWrite.title` and the
  admin's label resolution, all of which type the field as that literal union.
