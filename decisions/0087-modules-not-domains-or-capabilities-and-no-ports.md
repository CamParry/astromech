# 0087 — Modules, not domains or capabilities; no ports; no first runtime

**Date:** 2026-08-22
**Status:** accepted

Three words in the prose of `ARCHITECTURE.md`, `TERMINOLOGY.md` and the
`AGENTS.md` files had stopped describing the code, and one sentence stated a
priority the project does not hold. None of the four names a directory or an
identifier, so this is a vocabulary change with no code moved.

## "Capabilities" as a layer name

The directories under the content modules (`database`, `storage`, `fields`,
`config`, `permissions`, `hooks`, `request-context`, `email`, `ai`, `cron`,
`cloudflare`, `plugins/runtime`) were grouped as "capabilities". The group
existed to give dependency-cruiser a layer to name; `0070` removed
dependency-cruiser and the group kept its name with nothing reading it.

The word was also taken twice inside the codebase in its ordinary sense.
`entries/capabilities.ts` is the set of features an entry type declares
(`statuses`, `versioning`, `trash`, `staging`, …) and `entries/methods.ts`
gates methods on it; `database/capabilities.ts` is the driver feature probes
(`supportsTransactions`, `dump`, `restore`). Both are feature detection, which
is what a web developer expects "capability" to mean, and both stay. A reader
meeting "fields is a capability" alongside them had to hold a third meaning.

**Accepted:** the group has no name. `ARCHITECTURE.md` lists the directories
and says what they are: the modules the content modules build on, each doing
one thing and holding no business logic. Where a sentence needs a word,
"module" does.

**Rejected:**

- _Infrastructure._ The NestJS and Laravel word for the same shelf, and the
  best of the candidates, but it still invites a reader to ask whether
  `fields/` or `permissions/` is infrastructure. Not naming the group avoids
  the question.
- _Primitives._ True of `registry.ts`, false of `config/` and `cron/`.
- _Services._ Already the word for the verb object each content module
  exports.

## "Domains" as a layer name

`entries`, `media`, `users`, `settings` and `notifications` were "domains",
from domain-driven design. The DDD word implies a bounded context: a vertical
slice with its own model that other slices reach only through a published
interface. A CMS is not shaped like that. Entries reference users and media,
settings pages run the entries field pipeline, and `ARCHITECTURE.md` already
had to say "a domain may call a peer directly". Modules that try to keep their
boundaries but call each other are modules.

**Accepted:** everything under `packages/astromech/src/` is a module, and the
five that own business verbs are "the content modules" where they need
distinguishing. `domain` survives as the `MethodManifest.domain` field in
`packages/astromech/src/types/methods.ts`, the "domain value" sense in the row
codec (a JS value as opposed to its storage form), and in past decision
records.

**Rejected:**

- _Keep "domain" as a plain word without the DDD freight._ The freight is
  the only thing the word adds over "module"; without it the two are
  synonyms and one of them is enough.
- _Rename `MethodManifest.domain` in the same change._ It is on the wire in
  `.astro/astromech.methods.json`; a rename is code work with its own record.

## "Ports" on the plugin context

The narrowed handles a plugin receives on `PluginContext` (`ctx.storage`,
`ctx.email`, `ctx.database`, `ctx.config`, `ctx.methods`) were "ports", from
hexagonal architecture. That is real prior art, but it is a methodology's
dialect: to a web developer "port" is `:3000`, or porting code to another
language, and `TERMINOLOGY.md` needed a paragraph to undo the first reading.

**Accepted:** the handles have no collective noun. They are members of the
plugin context, described by what each one is. `ctx` already carries things
that are not narrowed backends (the content services, the user), so the
context is the unit a plugin author thinks in and "on `ctx`" is the whole
location. The `TERMINOLOGY.md` entry becomes "Driver vs plugin context"; the
distinction it draws (a driver is the whole backend, a context member is the
slice a plugin may use) is unchanged. `0008-plugin-methods-port.md` keeps its
filename and still describes the shape a member takes.

**Rejected:**

- _Handle._ Accurate, and the definition uses it, but as a collective noun it
  says nothing a reader could not get from `ctx.storage` itself.
- _Plugin API._ Reads as the whole of `PluginContext` plus the `astromech`
  barrel, which is wider than the narrowed members.
- _Scoped service._ Collides with `scopedServices(role)` in `policies/`.

## "Cloudflare is the shape decisions are made for"

The sentence was true when the D1 and R2 drivers were the reason the driver
pattern existed. It is not a project goal. Every backend has a Node driver and
a Cloudflare driver, `integrations/astro/` and `integrations/cloudflare/` are
siblings, and `roadmap/planned/multi-runtime-and-framework-integrations.md`
is the list growing. **Accepted:** Node and Cloudflare Workers have equal
standing, and a design that works on one and not the other is incomplete.
`.claude/commands/plan.md` names the constraint the same way.
