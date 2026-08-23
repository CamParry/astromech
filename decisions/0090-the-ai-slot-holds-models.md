# 0090 — The `ai` slot holds models, and boot assembly leaves the middleware file

**Date:** 2026-08-23
**Status:** accepted
**Supersedes:** 0032 in part (the naming half of its `ai` exception)

Four identifiers called the wrapped models a "config", and the function that
builds them at boot lived in the file named after one of the things it applies.

| Before            | After           |
| ----------------- | --------------- |
| `WrappedAiConfig` | `AiModels`      |
| `setAiConfig`     | `setAiModels`   |
| `getAiConfig`     | `getAiModels`   |
| `buildAiConfig`   | `buildAiModels` |

`buildAiModels` moves from `ai/middleware.ts` to `ai/models.ts`. No behaviour
changes, and the package's public surface — `getModel` and `hasModel`, fixed by
[0022](0022-core-hands-out-a-model.md) — is untouched.

## The rename finishes what 0032 started

[0032](0032-a-capability-slot-holds-what-the-config-declared.md) found that
accessor names were reporting their slots dishonestly: "`getDb()` and
`getStorageDriver()` named a thing, `getEmailConfig()` and `getImageConfig()`
named a config." It fixed email and image, and left `ai` behind as an explicit
"noted exception, not a fix". `getAiConfig` was the last accessor in core still
named after a config while holding something else.

What it holds is a set of `wrapLanguageModel` results. `Wrapped` compounded the
problem by naming an implementation detail — that a particular SDK function had
run — rather than what a caller receives.

Only the naming half of 0032's exception is resolved. The substantive half
stands: the slot still holds a transformed thing rather than what the config
declared, because core's logging middleware is applied once at boot and there is
nowhere else for it to run. That remains a real asymmetry with `storage` and
`email`, and it remains deliberate.

## `AiConfig` is correctly named and does not move

The type in `types/ai.ts` is the `ai:` block an author writes, and holding a
constructed model instance does not disqualify it. `storage: r2()`,
`db: libsql()` and `scheduler: interval()` all hold instances, as do Payload's
`db: postgresAdapter(…)` and Astro's `integrations: [react()]`. Config that
holds constructed objects is the norm in this ecosystem, and the type name
matches the key it describes.

The distinction the rename draws is between the block declared in config and the
value the registry holds after boot transformed it. Those were one word before
and are two now.

## Why the read stays `get`, against 0088

[0088](0088-get-throws-resolve-may-not-and-require-is-middleware.md) says `get*`
throws and `resolve*` returns `undefined`. `getAiModels` returns `null`, so read
literally the rule points at `resolveAiModels`.

It stays `get`, for the scope of the two records rather than their dates.
[0072](0072-the-registry-probe-is-get.md) is specifically about the registry
probe, and settled it on `Map.prototype.get`: a bare `get` over a keyed lookup is
nullable by web-platform convention, and the nullability lives in the return
type where a TypeScript reader looks for it. 0088's `resolve*` examples —
`resolveEntryType`, `resolveContentLocale`, `resolveTypeFields` — are all config
resolution, none is a registry read, and the record scoped itself to `entries/`
when it declined to rename `requireRole` and `requireLoaded`.

The local argument decides it. Five sibling probes read `getEmailDriver`,
`getSchedulerDriver`, `getImageConfig`, `getMethodManifest` and
`getDatabaseDriver`. Renaming one of the six makes it the odd member of a set
whose whole value is that they are guessable from each other.

Reconciling the two records across every registry probe is a live question and a
larger one. It is not answered here, and `getModel` itself — nullable, public,
and named by 0022 — sits in the same tension untouched.

## Why boot assembly leaves `middleware.ts`

`buildAiModels` is the boot-time assembly of the whole module: it owns the
dynamic `import('ai')` that [0021](0021-ai-as-an-optional-core-capability.md)
records as deliberate, it wraps every configured model, and it produces the
registry payload. Applying logging middleware is one step inside it. Naming its
home after that step is the wrong way round, the way putting `createServer()` in
`cors.ts` would be.

The split is clean because every import in `middleware.ts` was already
type-only. `logging()` and its `log()` helper now sit alone in a file with no
runtime imports, and `middleware.ts` no longer imports the registry at all, so
the module's internal graph loses an edge.

`models.ts` over `resolve.ts`, which would have matched `config/resolve.ts`:
the function constructs new wrapped instances rather than normalising declared
values, and `build` is the honest verb for that.

## Considered and dropped

- **Flattening `{ model, models }` into one `Record` keyed by name**, with the
  default under a known key. It removes the awkwardness of an `AiModels` type
  with a `models` field, but it invents a collision — a site naming a model
  `'default'` — to solve a cosmetic problem. The two fields stay, so the
  registry payload keeps mirroring the shape of the `AiConfig` it was built
  from.
- **`ModelRegistry`.** AI SDK's `createProviderRegistry` makes "registry" the
  ecosystem word for exactly this, which is the problem: `ai/registry.ts` is
  already a registry in this codebase's own sense, built on `createRegistry`.
  One word, two mechanisms, one file.
- **`ResolvedAiConfig`.** Keeps the noun the rename exists to remove.

## Consequences

Earlier records keep the old spellings, several as `buildAIConfig` from before
the acronym sweep in [0073](0073-acronyms-are-title-case.md): 0021, 0030, 0031,
0032 and 0072 all name it. They are append-only and accurate records of what was
true when they were written.
