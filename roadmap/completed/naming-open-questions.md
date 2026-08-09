# Naming questions the pass parked

Split out of the naming pass so these survive that spec's deletion. Both
questions asked where something belongs, not for a mechanical rename, and both
are now answered.

The completed pass is `roadmap/completed/naming-pass.md`; its rationale is in
`decisions/0009-service-method-client-vocabulary.md`,
`decisions/0015-public-subpaths-mirror-the-source.md`,
`decisions/0016-the-fields-module-vocabulary.md`,
`decisions/0017-resource-as-the-superordinate-noun.md` and
`decisions/0019-a-define-returns-the-thing.md`.

## `manifest-registry.ts` is in `codegen/` but isn't codegen

Accepted, and said so in the file header:
`packages/astromech/src/codegen/manifest-registry.ts` stays in `codegen/`
because `codegen/` owns the method manifest as a concept — `method-manifest.ts`
generates it, `manifest-registry.ts` is the runtime slot holding the generated
result — and splitting the pair across `codegen/` and `boot/` would make it
harder to find, not easier.

- [x] Say so in the file header.
- [x] Record the reasoning in `decisions/`.

## `policies/` → `guards/`

Stays `policies/`. `roadmap/completed/manifest-driven-transports.md` settled
the directory's job: `scoped-services.ts` is now the single enforcement seam
every untrusted transport composes, alongside filtering, advisory annotation
and confirmation. That job matches an authorization policy — Laravel Policies,
Pundit, IAM policies all answer "what may this actor do" — and not a guard:
NestJS, Angular and Vue Router use "guard" for a per-request interceptor
returning a boolean (`canActivate`), which is not the shape `scopedServices`
returns, and "guard" would misdescribe `annotate-manifest.ts` (advisory only,
by its own header) where "policy" covers advisory and enforcing alike. It also
pairs with the sibling `permissions/` directory the way Laravel's Gate and
Policy pair.

- [x] `ARCHITECTURE.md`'s directory map states what `policies/` is and why it
      is called that.
- [x] `TERMINOLOGY.md` gets a `Policy` entry.
- [x] Record the reasoning, including why "guard" lost, in `decisions/`.

`decisions/0040-policies-and-manifest-registry-keep-their-directories.md` has
the full reasoning for both.
