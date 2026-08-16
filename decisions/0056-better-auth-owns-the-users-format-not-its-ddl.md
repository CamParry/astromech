# 0056 — better-auth owns the `users` format, not its DDL

**Date:** 2026-08-16
**Status:** accepted

`users` has a `defineTable` descriptor and composes on `createStorage` like every
other domain. The descriptor _describes_ better-auth's on-disk format rather than
imposing one, and `tests/db/baseline-ddl-parity.test.ts` is the proof the two
agree.

## Context

`users/storage.ts` used to open with the opposite instruction: do not give
`users` a `Table`, because that would enrol a better-auth-owned table in our
DDL and migration pipeline. Under that rule `users` was the one domain writing
its own storage by hand — hand-typed `NewUser`/`UserPatch`, hand-written
list/count/get/create/update, a manual `updatedAt` stamp because no descriptor
meant no `onUpdate` column, and three `as unknown as` casts on the string-keyed
`encode('users', …)` path. It was also the only non-trivial entry in
`LEGACY_CODECS`, the codec tier that exists precisely for tables with no
descriptor.

Two facts, established while measuring the work, dissolve the reason for the
rule:

- **better-auth has no migration step here.** It never emits DDL for these
  tables. All four are hand-authored in the app's baseline migration, so "who
  emits the DDL" was never a question better-auth answered — we did, by hand.
- **What better-auth does own is the format.** Its adapter writes through its
  own Kysely instance on our dialect: ISO-8601 TEXT timestamps, its own
  generated id (a 32-character alphanumeric string, not a UUID), INTEGER 0/1
  booleans, TEXT json. Nothing in its configuration changes that.

Those are separable, and only the second is binding.

## Decision

Describe the format in a descriptor and take over emission. `col.id` gained a
`format` option so the vocabulary can state what our own writes mint; the `users`
descriptor then reproduces the hand-authored DDL, which the parity test enforces
on every run. Enrolling `users` in `CORE_TABLES` is what makes that test cover it
at all — under the old rule nothing checked the hand-authored block against
anything.

The direction of authority is the point: when the descriptor and better-auth
disagree, the descriptor is wrong. It is a description, and the parity test plus
a signup round-trip test are how we find out.

That direction was not hypothetical. The work started from the belief that
better-auth wrote unix-seconds INTEGER timestamps — the belief `LEGACY_CODECS`
had encoded since it was written, in a `decode` that parsed every one of these
columns as `new Date(v * 1000)`. Signing up against a real database and reading
the row back disproved it: better-auth writes ISO-8601 text, so every timestamp
it had ever written decoded to an Invalid Date, and the hand-authored baseline's
`integer` declaration described a format nothing produced. The descriptor is ISO
because that is what the writer writes; the bug it exposed was fixed in the same
work, for `sessions` and `accounts` too.

`sessions`, `accounts` and `verifications` keep no descriptor. Nothing of ours
writes them, so they earn nothing from one and stay hand-authored in the app's
baseline, still served by `LEGACY_CODECS`.

## Consequences

- `users` is in `CORE_TABLES`, so the committed snapshot must describe it. The
  snapshot was regenerated with `db:rebaseline --collapse`, which is what makes
  that a command rather than the hand-edit this decision would otherwise have
  required.
- `users` is now on the SQLite table-rebuild path, and `sessions`/`accounts`
  reference it with `ON DELETE cascade`. A rebuild would destroy auth state, so
  the generator refuses to emit one for a table whose children cascade.
- `roleSlug` is `notNull` with no SQL default, so it is required on insert. The
  default lives in code (`DEFAULT_ROLE_SLUG`) and every write path supplies it;
  a path that forgets fails at the insert rather than minting a role silently.
- The timestamp columns render as `text`. Rows our own storage wrote in seconds
  before this change still decode, because the ISO parser tolerates a numeric
  value; that tolerance exists for those rows and for nothing else.

## Rejected

- **Keep the hand-written storage.** The status quo. Costs the casts, the
  hand-maintained row types, the manual `updatedAt`, and — the real price —
  leaves the baseline's `users` DDL checked by nothing.
- **A descriptor for the codec and storage only, kept out of `CORE_TABLES`.**
  Removes the casts without enrolling the table in DDL emission, so it needs no
  snapshot change. Rejected because it also forfeits the parity test: the
  descriptor and the baseline could drift apart with nothing to notice, which is
  the failure this work exists to close.
- **Record better-auth's ids as UUIDs.** They are not. better-auth's default
  id generator produces a 32-character alphanumeric string; our `appDefault`
  mints a uuid and never runs on the signup path. The column is text and holds
  both, and no code may assume otherwise.
- **Teach the parser to accept both timestamp formats and leave both writers
  alone.** Cheaper, and it fixes the Invalid Dates. Rejected because it makes the
  column permanently bimodal: every future reader has to handle two formats, and
  nothing ever converges. Matching the writer that owns the format costs one
  option and ends the divergence.
