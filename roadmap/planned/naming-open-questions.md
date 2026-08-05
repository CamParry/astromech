# Naming questions the pass parked

**Status:** planned, not designed. Split out of the naming pass so these survive
that spec's deletion. Each needs a conversation, not an implementation — none is
a mechanical rename, and one of them changed shape after the review that raised
it.

The completed pass is `roadmap/in-progress/naming-pass.md`; its rationale is in
`decisions/0009-service-method-client-vocabulary.md`,
`decisions/0015-public-subpaths-mirror-the-source.md`,
`decisions/0016-the-fields-module-vocabulary.md`,
`decisions/0017-resource-as-the-superordinate-noun.md` and
`decisions/0019-a-define-returns-the-thing.md`.

## `content/` → ? — lowest confidence, do not action from notes

A downstream domain whose service is `translate` / `transform` / `generate`,
rewriting entry fields through a registered model (`ContentProvider`,
`ContentRewriteRequest.rewrite`).

In a CMS, "content" means everything the CMS manages. Entries are content. Media
is content. This directory is model-backed text rewriting sitting as a sibling to
`entries/` and `media/`, implying it is a peer category of stuff rather than an
operation over them. `ARCHITECTURE.md` has to spell the relationship out because
the name doesn't: "content operations (translate/transform/generate) — a
DOWNSTREAM domain: it may import entries/, never the reverse."

Candidates: `rewriting/` (what the code does), `ai/` (what powers it).
`authoring/` was on the shortlist and was ruled out as taken by the plugin that
shipped 2026-08-03; that plugin is now `@astromech/assistant`, so the name is
**free again**. `ContentProvider` →
`ModelProvider` reads better than any of the domain renames it would accompany,
and could go on its own.

## `dispatch` lives under `transport/mcp/` but serves three transports

`buildDispatch` and `buildScopedDispatch` are exported from `astromech/methods`
and used by the CLI, the MCP server and the in-process tool loop, but live in
`transport/mcp/dispatch.ts` — a shared thing filed under one of its consumers.

Move to `transport/dispatch.ts`, or to `policies/`, which is a more coherent home
than it was now that `with-permissions.ts` has left for `permissions/`. Interacts
with the `guards/` question below, so decide them together.

## `manifest-registry.ts` is in `codegen/` but isn't codegen

`codegen/` holds `type-generator.ts`, `method-manifest.ts` and
`plugin-client-manifest.ts` (all generators) plus `manifest-registry.ts`, which
`ARCHITECTURE.md` describes as the boot-generated copy read at runtime.
`getMethodManifest` is public and resolves here.

Either move it to `boot/` or accept it and say so in the file header. Small, but
it sends people grepping the wrong directory.

## `policies/` → `guards/`

The code reaches for "guard" already — `permissions-for.ts` calls itself "a
permission guard", `scoped-services.ts` "the single enforcement seam", both "fail
CLOSED" — and NestJS, Angular and Vue Router all use the word for this.

Against: `method-filter` is a filter and `confirmation` is a brake, so it fits
some of the directory and not all of it, and it swaps one imperfect umbrella for
another. The directory is now four files, which makes the question easier than it
was. Revisit once `ai-integration` lands and the directory's real job has
settled. Worth a `decisions/` record either way.
