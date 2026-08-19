# 0072 — The registry probe is `get`, and the throwing read is `getOrThrow`

**Date:** 2026-08-19
**Status:** accepted
**Supersedes:** 0069 (the probe half only; the flat `build` sequence stands)

The registry primitive in `packages/astromech/src/utilities/registry.ts` now
reads:

```ts
type RequiredRegistry<T> = {
    set(value: T): void;
    /** Null when unset. */
    get(): T | null;
    /** Throws when unset. */
    getOrThrow(): T;
    clear(): void;
};
```

`maybeGet` is gone. The nullable read is `get`; the throwing read carries the
suffix.

## Why the names flipped

This is the fourth name the probe has had in three records (`peek` → `tryGet` →
`maybeGet` → `get`). That churn is itself the finding. Each of the first three
was an attempt to invent a prefix that says "this one can return nothing", and
every attempt collided with something a reader already knew: `peek` is stack
vocabulary, `tryGet` is the .NET `TryGetValue` out-param pattern, `maybeGet`
borrows an Option type the codebase does not have. The problem was never which
prefix; it was that a prefix was being coined at all.

Two pieces of prior art already say it without coining anything:

- **`Map.prototype.get`** returns `V | undefined`. On the web platform, a bare
  `get` is nullable by convention, and this registry is a keyed lookup over a
  `Map` in the keyed case and over one global object in the single case. A
  reader who has used a `Map` has already been taught the semantics.
- **Kysely's `executeTakeFirst` / `executeTakeFirstOrThrow`.** The library the
  database layer is built on states the throw with an `OrThrow` suffix on the
  same base verb. `getOrThrow` is that pattern, and it is common enough beyond
  Kysely (Guava, Kotlin, Rust's `expect`) to be guessable cold.

The nullability lives in the type, which is where TypeScript readers look for
it. `get(): T | null` says everything `maybeGet` was trying to say, and says it
in the signature rather than the identifier. The throwing variant is the one
doing something the type cannot express, so it is the one that gets a word.

## What changed since 0069

0069 kept `get` as the throwing read on a site count (135 throwing reads against
14 probes: let the dominant read keep the short name) and on a risk: flipping
`get` "would risk turning a loud throw into a silent `null` at any missed site".

The count argument optimises the diff, not the reader. It is a one-time cost
paid by whoever does the rename, against a permanent cost paid by everyone who
reads the code afterwards. Before an npm release there is no third party holding
the old spelling, so the one-time cost is as low as it will ever be.

The risk argument is answered by the compiler. `strict: true` is on, so the
flipped `get` returns `T | null` and every site that expected a value fails
`tsc` rather than degrading at runtime. A missed site is a build error, not a
silent null. That was true when 0069 was written too; the record over-weighted a
hazard the type system already covers.

## The exception: `database/driver-registry.ts`

Every other subsystem exports only one variant, so its wrapper keeps its bare
name and simply becomes honest: `getEmailDriver`, `getSchedulerDriver`,
`getAiConfig`, `getMethodManifest` and `getImageConfig` are nullable, and
`getDb`, `getStorageDriver` and `getConfig` throw. The throwing ones state the throw in
their doc comment, since the name no longer does.

`driver-registry.ts` is the one module that exports both, so it takes the
suffix:

| Before                   | After                      |
| ------------------------ | -------------------------- |
| `getDatabaseDriver`      | `getDatabaseDriverOrThrow` |
| `maybeGetDatabaseDriver` | `getDatabaseDriver`        |

This is the only place in the rename where a name changed meaning rather than
just spelling, so it was swept by hand against every call site rather than by
pattern.

## Rejected

- **`requireGet` / `getRequired` for the throwing read.** "Required" describes
  the slot's configuration (whether the registry was created with
  `required: true`), not what the call does when the slot is empty. Using it for
  the throw would give one word two jobs inside the same file.
- **`getOrFail`, `getStrict`, `unwrap`.** `getOrFail` is vaguer than the thing
  it names (a throw is a specific kind of failure); `getStrict` is a quality
  word; `unwrap` imports Rust's `Option`/`Result` vocabulary into a codebase
  with neither.
- **Leaving the pair alone and renaming only the wrappers.** The audit's first
  reading was that the wrappers (`maybeGetDatabaseDriver` and friends) were the
  problem. They are downstream of the primitive: fix the primitive and the
  wrappers read correctly with no rename at all, which is what happened here.
