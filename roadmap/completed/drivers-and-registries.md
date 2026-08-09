# Drivers and Registries

Every capability the host plugs in follows the same three steps: the config
declares a driver, `initRuntime` moves it to a `globalThis` slot, and everything
else reads it from there. The steps are consistent. Nothing else is. The driver
is authored three different ways depending on which capability it is, arrives in
its slot in four different shapes, is stripped from `ResolvedConfig` for five of
the eight capabilities and left in for three, and reaches a plugin as a raw
instance, a narrow port, a scoped port or a bare function depending on which one
you ask for.

None of it is broken. All of it has to be learned separately.

## The rule

> A capability that is **one shared resource for the whole app** is declared in
> config and reached from a registry, never from config. Behaviour attached to
> **one specific entity** stays where it was declared.

The second half matters as much as the first. `validate` functions, `hooks`,
`access`, entry `url` templates, field `condition` and admin page components are
all declared in config, read from the resolved config at call time, and never go
near a registry. That is correct: they are policy attached to one entity, and
there is nothing for a registry to arbitrate. Only shared resources move.

Under the rule, these are the eight shared resources: `db`, `storage`, `email`,
`image`, `ai`, `scheduler`, `plugins`, and per-type `entries[].storage`.

## Why the driver cannot simply be read off the config

Worth recording, because the question is reasonable and the answer is not
obvious. The drivers are already self-contained lazy objects: `r2()` resolves its
binding on first use because a resolved bucket is not reachable from Node
(`packages/astromech/src/storage/drivers/r2.ts`), and `libsql()` memoises
`getInstance()`. Nothing about them needs boot to make them usable, so
`config.storage.put(…)` looks like it should just work now that
`virtual:astromech/config` is a live module.

Two things stop it, neither about the drivers:

- **The config module is not importable from everywhere core runs.** Core
  executes in four import graphs: the Vite SSR graph, the plain-Node integration
  graph that `packages/astromech/src/boot/astro.ts` loads through jiti at config
  time, the CLI, and vitest. `virtual:astromech/config` resolves only in the
  first. `packages/astromech/src/cron/runner.ts` reads `getRuntimeConfig()` from
  a registry for exactly this reason, and
  `packages/astromech/src/transport/cli/virtual-config-shim.ts` exists for it. A
  direct import would work under SSR and break `db:generate`.
- **The config module evaluates twice under `astro dev`.** Measured during
  `roadmap/completed/runtime-boot-and-live-config.md`, not assumed: module-level
  state is not shared between the two copies and `globalThis` is. A driver
  memoising its connection in module scope would hold two pools under dev and one
  in production.

A third, smaller one: tests swap drivers constantly, and `setStorageDriver(fake)`
is one line where module mocking is a fixture.

So the registry stays. What should go is the other thing boot does: reassembly.
`setEmailConfig({ driver, from })` and `setImageConfig({ driver, widths, avif, mediaRoute })`
take a self-contained driver and glue values onto it from elsewhere in the
config, and that is what makes the slots inconsistent in kind. Delete the glue,
keep the lookup, and a slot holds exactly what the config declared for that
capability, normalised and defaulted, with nothing copied in from another key.

That is the rule, and it is not "a slot holds only the driver". `storage` and
`email` hold a driver because a driver is all they were ever declared as. `image`
holds `{ driver, widths, avif }` because it is the one capability with core
policy genuinely attached to it: the media route rejects widths it will not
serve, so the allow-list belongs to core rather than to `sharp()`. Only
`mediaRoute` and `from` are glue.

## What is inconsistent today

**The `ResolvedConfig` strip list is sediment, not a rule.** It reads
`Omit<AstromechConfig, 'plugins' | 'db' | 'scheduler' | 'ai'>`
(`packages/astromech/src/types/config.ts`), leaving `storage: StorageDriver`,
`email.driver` and `image.driver` in place though all seven are the same kind of
thing. `decisions/0021` justified the `ai` strip by the JSON round trip;
`decisions/0031-the-plugin-config-view-is-an-allow-list.md` argued `db`,
`scheduler` and `plugins` case by case; `storage`, `email` and `image` were never
argued at all, because `JSON.stringify` was silently deleting their methods
anyway. `ResolvedConfig` is then stashed in the `runtimeConfig` slot and threaded
through most of core, so a working `StorageDriver` rides inside "the resolved
config" everywhere it goes.

Nothing reads them. `config.storage`, `config.email` and `config.image` appear
only in `packages/astromech/src/boot/boot.ts` (the transfer),
`packages/astromech/src/boot/config-resolver.ts` (`image.driver.name`, for a
compatibility assertion) and `packages/astromech/src/boot/admin-config.ts`
(`image.widths`), and the last two read the raw `AstromechConfig`, not the
resolved one.

**A slot holds four different kinds of thing.**

| Slot            | Holds                                                              |
| --------------- | ------------------------------------------------------------------ |
| `db`            | the live `Kysely` instance                                         |
| `dbDriver`      | the driver that produced it                                        |
| `storage`       | the driver only                                                    |
| `email`         | `{ driver, from }`, a driver plus a config value                   |
| `image`         | `{ driver, widths, avif, mediaRoute }`, one from a different field |
| `ai`            | the config, wrapped in logging middleware                          |
| `runtimeConfig` | the entire resolved config                                         |

The accessor names report it honestly: `getDb()` and `getStorageDriver()` name a
thing, `getEmailConfig()`, `getImageConfig()` and `getAIConfig()` name a config.
`db` is also the only capability with an instance/driver split.

**A driver is authored three ways.** Storage and image drivers are lowercase
factories (`filesystem()`, `r2()`, `s3()`, `sharp()`, `cloudflareImages()`).
Email drivers are exported classes that need `new` and carry a `Driver` suffix
(`new ConsoleDriver()`, `new SmtpDriver()`, `new ResendDriver()`). Scheduler
drivers are pre-built singleton objects (`nodeDriver`, `httpDriver`,
`cloudflareDriver`). Database drivers are factories, but `libsqlDriver()` keeps
the suffix while `d1()` does not.

**The plugin surface has four shapes for five capabilities.** `ctx.db` is the raw
`Kysely` straight from `getDb()`. `ctx.database` is a narrow maintenance port.
`ctx.storage` is a scoped port that prefixes keys with `plugin/<alias>/`.
`ctx.sendEmail` is a bare function. Image, AI and scheduler have no port at all.

**Host `entries[].storage` is declared and then ignored.** The same pattern one
level down. `packages/astromech/src/boot/config-resolver.ts` resolves a host
entry type's capabilities from `cfg.storage?.supports`, identically to the plugin
path, but the only `setEntryStorage` call is in
`packages/astromech/src/plugins/runtime/plugin-runtime.ts` inside
`registerPlugins`, iterating plugin entry types. A host type declaring custom
storage gets that storage's capability set and is then served by built-in
storage. `supports: ['statuses']` silently disables slug, trash, versioning,
staging and translations on a type the built-in storage handles fine, and a
config explicitly asking for one of those throws at boot naming a storage that is
not in play.

## Change

The config surface changes, so these land together on one branch rather than
dribbling out.

- [x] **WS1 — `ResolvedConfig` holds no drivers.** Extend the `Omit` to `storage`
      and `email`, rewrite it as an explicit list of registry-held capabilities
      with the rule as its docblock, and drop `image` from `ResolvedMediaConfig`,
      which a top-level `Omit` cannot reach once WS4 nests it under `media`. The
      `media.image` half landed with WS4, a commit early, since nesting `image`
      under `media` is what put it out of the top-level `Omit`'s reach.
      Free: nothing reads any of them post-boot, and
      `packages/astromech/src/boot/admin-config.ts` builds `imageWidths` from the
      raw `AstromechConfig`. This also demotes `PluginConfigView`'s allow-list
      `Pick` in `packages/astromech/src/types/plugins.ts` from sole barrier to
      second layer, which is a better place for it to sit. `media` is named in
      that `Pick`, so the nested strip is load-bearing rather than tidiness:
      without it a live `ImageDriver` rides into every plugin's
      `ctx.config.media`.
- [x] **WS2 — Register host entry storage.** A loop over `config.entries` in
      `initRuntime`, placed after `registerPlugins`, which opens with
      `resetEntryStorageOverrides()` and would otherwise wipe it. The alternative
      is dropping `storage` from host entry types, but
      `packages/astromech/src/boot/config-resolver.ts` already treats both paths
      identically, so registering it is the smaller lie to unwind. The
      `titleField` check in
      `packages/astromech/src/entries/storage/capabilities.ts` keeps rejecting
      anything but `'title'` or `false` unconditionally, which is correct: only
      the error message promising custom storage would help was wrong, and it is
      gone. Widening `titleField` to an arbitrary field name is a separate
      feature — it would have to reach `createEntrySchemaFor`,
      `EntryRecord.title`, `EntryWrite.title` and the admin's label resolution,
      all of which type the field as the literal `'title' | false`.
- [x] **WS3 — A slot holds what the config declared, and nothing copied in.**
      `email` becomes the `EmailDriver`: `from` moves into the email driver's
      factory, since it is the envelope sender and the two call sites
      (`packages/astromech/src/users/auth.ts` and the plugin `sendEmail`) both
      pass it straight to `driver.send({ from })`, so `EmailMessage` drops the
      field and each driver supplies its own. `image` keeps
      `{ driver, widths, avif }` and loses only the `mediaRoute` copy; its two
      readers (`packages/astromech/src/media/serving/handler.ts` and
      `packages/astromech/src/media/serving/image/Image.astro`) take the route
      from the resolved config, which `Image.astro` already imports. `widths` and
      `avif` stay out of `sharp()` because they are core's allow-list, and stay
      out of `media` at large because they are image policy that does not
      generalise: a video has a bitrate ladder, a PDF has page thumbnails.
- [x] **WS4 — Every capability slot is authored as its driver.**
      `email: resend({ apiKey, from })` alongside the existing `db:` and
      `storage:`; nobody types `.driver` on a slot that is only a driver. `image`
      moves under `media` as `media.image`, because the image pipeline only ever
      operates on a stored media record (`Image.astro` takes `src: Media`,
      `buildImageAttrs` takes `{ id, filename, mimeType }`), which makes it a
      media sub-capability rather than an app-wide one like `storage`, which also
      backs `ctx.storage` and backups. `assertMediaAccessCompatible` in
      `packages/astromech/src/boot/config-resolver.ts` stops being a cross-key
      assertion as a result. `media.image` keeps its `driver` key, being the one
      slot with core policy beside the driver, and the nesting is what makes the
      bare `widths` read correctly. Pick one authoring style for a driver and
      convert the outliers: lowercase factory is the majority and the only one
      that can defer work, so the email classes become `consoleEmail()`,
      `resend()` and `smtp()` (`console()` is unusable — the import shadows
      `globalThis.console` in a config file), and the scheduler singletons become
      `interval()`, `webhook()` and `cloudflareCron()`, named for the triggering
      mechanism rather than the host. All of them need published subpaths: the
      scheduler drivers have none today, so a site cannot select one at all. The
      one database factory still carrying the suffix loses it too —
      `libsqlDriver()` becomes `libsql()`, matching `d1()`, on the same
      `astromech/database/libsql` subpath.
- [x] **WS5 — Plugins receive ports, never drivers.** `ctx.sendEmail` becomes
      `ctx.email.send(to, subject, element)`, matching `ctx.storage.put(…)`. It
      stays a port rather than the raw driver for two reasons: it renders the
      React element to html and text, and it throws a named error when the site
      configures no email driver. That keeps a plugin off `EmailMessage` and off
      the render step, and gives email the same shape as `ctx.storage`. It does
      not apply a template override, and cannot: `registerEmailOverride` keys
      overrides by name and a plugin hands the port a bare `ReactElement` with no
      name attached. Small blast radius: one real call site in
      `packages/plugins/forms/src/notifications/providers/email.ts`, one test
      fixture, the demo config comment, and
      `apps/docs/plugins/authoring.md`.
- [x] **WS6 — Write the rule down.** A `decisions/` record for the rule and what
      it rejected, the `ARCHITECTURE.md` layer notes, and the plugin context
      section of `apps/docs/plugins/authoring.md`. The record has to carry the
      `media.image` comparison as well as the rule, since three flatter shapes
      were live: `image: sharp({ widths })` (rejected, the allow-list is core's),
      `media: { widths, avif }` (rejected, widths are image policy, not media
      policy), and a root `image:` beside a future root `video:` (rejected, image
      is a media sub-capability). Astro's `image.service`, Next's `images.loader`
      and Strapi's `upload.breakpoints` all pair the transform driver with the
      variant policy in one object keyed by media kind; none of them flattens the
      ladder or pushes it into the driver. `TERMINOLOGY.md` gets an entry for
      driver against port, since after WS5 the distinction is load-bearing: a
      driver is what the host configures, a port is what a plugin receives.
      Landed as `decisions/0032-a-capability-slot-holds-what-the-config-declared.md`.
      The `ARCHITECTURE.md` notes went in with WS1, WS4 and WS5 rather than here,
      each alongside the change it describes. `apps/docs/plugins/authoring.md`
      gained a capability-ports section covering `ctx.storage`, `ctx.email` and
      `ctx.database` as a set, since only the email rename had reached it.

## Not in scope

- **The registry mechanism.** Two implementations (`createRegistry` versus
  hand-rolled `globalThis.__astromechX`) is a real inconsistency and it already
  has a file: `roadmap/planned/registry-consolidation.md`. That item is about how
  a slot is built; this one is about what goes in it. Order does not matter here:
  every capability slot this item touches already goes through `createRegistry`,
  and the hand-rolled globals are all elsewhere (entry storage, email overrides,
  entry access, request context, the plugin runtime).
- **Narrowing `ctx.db`.** Handing plugins the unrestricted `Kysely` makes
  `ctx.storage`'s key prefix a convention rather than a boundary, since a plugin
  holding raw Kysely can already reach every core table. Under WS5's rule it is
  the remaining outlier. It is also the expensive one: `@astromech/backups` and
  `@astromech/assistant` both lean on it hard, and narrowing it is a design
  question rather than a rename. Separate item when someone wants to take it.
- **A `media.video` slot.** `media.image` gives one an obvious home, and that is a
  consequence of this change rather than a reason for it. A video driver is not
  symmetric with an image driver: Cloudflare Stream stores the bytes itself and
  hands back an HLS manifest, which breaks the invariant that `storage` is the
  single blob store for every media byte, and it has no width ladder at all
  because it does adaptive bitrate. That is a storage question, not a config-key
  question, and guessing its shape now is what a speculative `media.video` would
  be doing.
- **`avif: boolean` becoming `formats: ImageFormat[]`.** Next's `images.formats`
  generalises better, and the one reader
  (`packages/astromech/src/media/serving/image/build-image-attrs.ts`) already
  maps the boolean to `['avif', 'webp']`. Held deliberately: it needs negotiation
  order defined, and this item is about where a capability is declared rather
  than what it declares.
- **The `ai` logging wrapper.** `buildAIConfig` wraps models in logging
  middleware, so the `ai` slot holds a transformed thing rather than what the
  config declared. That is core policy rather than driver reassembly, so it
  survives WS3 as a deliberate exception, noted rather than fixed.

## Verification

- [x] The gate, plus a `apps/demo` build and a run of `dist/server/entry.mjs`.
      None of this is covered by the suite, and WS1 through WS4 all touch the
      boot path that only a real build exercises. See
      `roadmap/planned/gate-runs-a-build.md`. The built server serves `/`,
      `/admin` and `/blog`, and every driver subpath imports and exports the name
      it should — which only a build can show, since a worktree resolves `dist`
      to the main checkout.
- [x] A host entry type with custom storage actually reaches that storage, proved
      by a storage whose methods throw:
      `packages/astromech/tests/boot/init-runtime.test.ts` drives the real
      `initRuntime` rather than the harness, which mirrors the boot sequence and
      so cannot fail when the loop moves or goes.
- [x] Email still sends under both `astro dev` and a built server after `from`
      moves, including the password reset path in
      `packages/astromech/src/users/auth.ts`, which is the one caller outside the
      plugin port. `POST /api/auth/request-password-reset` prints
      `To: … | From: demo@astromech.dev` on both, so the driver supplies the
      envelope sender the message no longer carries.
- [x] Image variants still serve at every configured width after the slot moves
      to `media.image` and loses its `mediaRoute` copy, and the admin still builds
      thumbnail URLs. All seven widths return `image/webp`, `f=avif` returns
      `image/avif`, and an unlisted width still 404s, so the allow-list survived
      the move. `imageWidths` reaches the admin bundle and the media library
      renders `<picture>` srcsets in both formats.
