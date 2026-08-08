# 0030 — The server loads the config as a module

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** 0021 in part (its reasoning for the `ai.model` strip)

The Astro integration takes a **path** to `astromech.config.ts`, and
`virtual:astromech/config` re-exports that path so the SSR graph evaluates the
author's own module. Boot moved out of `astro:config:setup` into the injected
middleware, which runs in the serving process on the first request. Driver
instances, model instances, `{ custom: fn }` field rules and resource-level
`validate` reach the running server, because nothing turns them into data on the
way.

Before this the virtual module was a JSON literal built from `resolvedConfig`,
and boot ran in the process that built the site.

## Why not register live values at boot

A superseded roadmap item, `config-functions-reach-the-server`, proposed the
other direction and was deleted when this work replaced it: leave the config as
data, and have boot copy the behaviour-carrying values out of the live config
into registries before it is serialised. Astromech
had already done this twice, for `config.ai.model` and for the resource
validators in `fields/resource-validators.ts`, and both worked in development.

They worked because boot ran in `astro:config:setup`, which under `astro dev` is
the same process that serves the request. In a build it is not. A deployed
server ran no Astromech code at all until a request arrived, and nothing brought
a request to boot, so the registries were empty and every request failed with
`[Astromech] 'dbDriver' is not configured`. Adding a third registry would not
have helped: the defect was where boot ran, not what it registered.

Moving boot into the request is therefore most of this decision. Once the
serving process boots itself it needs the config in that process, and at that
point loading the module is simply less work than serialising it and
reconstituting the parts that did not survive.

## The prior art

Every CMS whose config holds live objects loads the config file as a module in
the serving process. Payload imports `payload.config.ts` at runtime through a
path alias and serialises nothing. Keystone compiles to `.keystone/config.js`
and requires it at runtime. Strapi and Sanity are the same idea in their own
shapes. The systems that serialise (`@astrojs/db`, Nuxt's `runtimeConfig`,
`astro:config`) do so because their config is data by construction and never
behaviour.

In Astro specifically, `auth-astro` already ships the re-export: its virtual
module is `import authConfig from "${configFile}"; export default authConfig`,
and Auth.js providers and database adapters survive it intact.

Astro has no runtime hook, by design. Every documented integration hook is
dev-time or build-time. Asked for a production start hook, a maintainer stated
the rule: passing a function is unsafe because the information has to be
available after a build and a function is not serialisable, so "usually, we
accept a path to an entry point, load it, and execute it." That mechanism is
`addMiddleware({ entrypoint })`, which Astromech was already using for the
session middleware, so boot went there rather than into anything new.

## The cost, and why it is affordable

The config is evaluated twice: once in plain Node at config time, which is what
route registration, the admin config, codegen and the build-time migration run
read, and once in the SSR graph. This is where Astromech differs from
`auth-astro`, which needs nothing from its config at config time and so never
loads it in Node.

Two evaluations are safe only because **exactly one of them is ever booted**. The
eager `initRuntime` call was deleted rather than supplemented, so the copy that
fills the registries is the one the serving process holds. Drivers construct
lazily, so the unbooted copy costs nothing; `libsqlDriver` already did. In a
build the two evaluations are in different processes and never coexist. Only
`astro dev` holds both at once.

Two authoring rules fell out of it, both now stated in `apps/docs/`. The first:
config paths resolve against the working directory, and nothing may be derived
from `import.meta.url`, which points at the emitted chunk once the config is
bundled into the server. The demo built its SQLite URL that way and got an empty
database in `dist/server/chunks/`, served 200s over. The second: an optional peer
reachable from the `astromech` barrel becomes a hard build error unless the
package declares it in `peerDependenciesMeta`, which is why `nodemailer` and
`wrangler` are declared there.

Measured on a built server rather than in dev: `/` went 500 to 200 and `/admin`
404 to 200, and a `{ custom: fn }` rule returns 422 under both `astro dev` and
`node dist/server/entry.mjs`. Config evaluations are one per build, one per
serving process, two under `astro dev`.

## What this changes in 0021

[0021](0021-ai-as-an-optional-core-capability.md) justifies stripping
`config.ai.model` from `ResolvedConfig` on the ground that
`virtual:astromech/config` is JSON and a model serialised through JSON arrives
as `{}`. That premise is gone: the virtual config is the author's module, and a
model would now survive it.

The strip stays, on a different rationale. Consumers must reach the model
through `getAIConfig()`, which hands back the copy `buildAIConfig` wrapped with
logging middleware ([0022](0022-core-hands-out-a-model.md)). A readable
`config.ai.model` would be a second, unwrapped route to the same model, and the
wrap is the chokepoint 0022 exists to guarantee. So `ResolvedConfig` still omits
`ai`, and the reason to keep it omitted is the wrap, not the round trip.

The same passage implies `config.storage` and `config.email.driver` are stripped
alongside the model. They never were. Both are declared on `ResolvedConfig`,
which omits `plugins`, `db`, `scheduler` and `ai` and nothing else. What
happened to them is that `JSON.stringify` reduced them to husks nothing could
call, which is a different failure, and one this decision removes rather than
works around.
