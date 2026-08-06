# Naming questions the pass parked

**Status:** planned, not designed. Split out of the naming pass so these survive
that spec's deletion. Each needs a conversation, not an implementation — both
are questions about where something belongs, and neither is a mechanical rename.

The completed pass is `roadmap/completed/naming-pass.md`; its rationale is in
`decisions/0009-service-method-client-vocabulary.md`,
`decisions/0015-public-subpaths-mirror-the-source.md`,
`decisions/0016-the-fields-module-vocabulary.md`,
`decisions/0017-resource-as-the-superordinate-noun.md` and
`decisions/0019-a-define-returns-the-thing.md`.

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
