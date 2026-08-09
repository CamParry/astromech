# 0040 — `policies/` keeps its name, and `manifest-registry.ts` stays in `codegen/`

**Date:** 2026-08-09
**Status:** accepted

`roadmap/planned/naming-open-questions.md` parked two directory questions
pending the directories' jobs settling. Both have now settled, and both names
stay.

## `policies/` over `guards/`

`roadmap/completed/manifest-driven-transports.md` made `scoped-services.ts`
what `ARCHITECTURE.md` now calls the single enforcement seam: every untrusted
transport — the HTTP REST routes, `POST /rpc/:id`, the AI tool-loop — composes
`scopedServices(role)` for its handle, and the trusted ones compose nothing and
say so.

The roadmap's case for "guard" was that the code already reaches for the word:
`permissions/permissions-for.ts` calls `permissionsFor(role)` "a permission
guard, the single enforcement seam", and NestJS, Angular and Vue Router all use
"guard" for request-level authorization. Weighed against three things:

- **The prior art that actually fits is an authorization policy** — Laravel
  Policies, Pundit in Rails, IAM policies. All three answer "what may this actor
  do to this resource", which is what all four files in `policies/` answer.
- **"Guard" is a taken word with a specific shape, and it is the wrong shape.**
  In NestJS, Angular and Vue Router a guard is a per-request or per-route
  interceptor returning a boolean — `canActivate`. `scopedServices(role)`
  returns restricted service handles a caller cannot exceed, not a boolean
  gating a single call. A reader who arrives with the `canActivate` model has to
  unlearn it, which costs more than an unfamiliar-but-accurate name.
- **"Guard" would misdescribe two of the four files, where "policy" covers all
  four.** `annotate-manifest.ts` says in its own header that it is ADVISORY UX
  ONLY, not the security boundary; `method-filter.ts` is structural filtering of
  what a transport offers, not a per-call check. Only `scoped-services.ts`
  enforces and `confirmation.ts` brakes. An authorization policy is naturally
  either advisory or enforcing — a permission policy document says what is
  allowed whether or not anything reads it before acting — so "policy" is the
  umbrella that actually spans the directory; "guard" is not.

It also pairs correctly with the sibling `permissions/` directory:
`permissions/` holds the vocabulary a policy applies (`Permission`, `Role`,
`permissionsFor`), and `policies/` holds the things that apply it, which is
exactly Laravel's Gate-versus-Policy split. `guards/` next to `permissions/`
has no equivalent pairing to point to.

No rename. `ARCHITECTURE.md`'s directory map now states what `policies/` is —
authorization policies over the manifest, not per-request guards — so the
question does not get reopened by someone reading four files with no shared
statement. `TERMINOLOGY.md` gets a `Policy` entry for the same reason.

## `manifest-registry.ts` stays in `codegen/`

The roadmap's other option was moving it to `boot/`, on the grounds that
`ARCHITECTURE.md` already describes it as "the boot-generated copy" rather than
a generator.

It stays, because `codegen/` owns the method manifest as a concept, not as a
generation step: `method-manifest.ts` generates it, `manifest-registry.ts` is
the runtime slot holding the generated result, and the two are one pair, not a
generator and an unrelated boot concern that happens to store its output. The
reason the result cannot simply be written to disk and read back like
`type-generator.ts`'s output is what the file already documented: the manifest
carries Zod schemas from the RAW plugin definitions, and Zod schemas do not
survive JSON, so the manifest is regenerated once at boot instead. That is a
fact about the manifest, not a fact that argues for a different directory.

Moving the registry to `boot/` would put the generator and its runtime slot in
two directories a reader has to already know are paired to find both, for a
directory that would otherwise hold nothing method-manifest-shaped at all — a
worse outcome than the one being fixed.

No move. The file's own header now says why it is in `codegen/` rather than
only describing its mechanism.
