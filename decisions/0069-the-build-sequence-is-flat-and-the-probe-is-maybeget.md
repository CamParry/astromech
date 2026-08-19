# 0069 — The build sequence is flat, and the registry probe is `maybeGet`

**Date:** 2026-08-19
**Status:** accepted
**Supersedes:** 0067, 0068

Two same-day refinements to the composition root. 0067 renamed the registry
probe `peek` → `tryGet`; 0068 split the create sequence into `registerBackends`,
`registerPluginRuntime` and `registerBuiltInJobs` wrappers in a `registrations.ts`
file. This record settles the final shape of both.

## The registry probe is `maybeGet`

`tryGet` read as the `try`/`catch` or dictionary `TryGetValue` pattern — an
attempt that reports success, and in its native form returns a bool with the
value in an out-param. This method does none of that: it is a plain read that
returns the value or `null`. `maybeGet` names the actual semantics — the value
may be absent. `get` stays the throwing read (the 135-vs-14 site reasoning from
0067 holds: the dominant read keeps the short name, and flipping `get` would risk
turning a loud throw into a silent `null` at any missed site).

Rejected: **`safeGet`** (by analogy to zod's `safeParse`). zod's `safe*` returns
a result object (`{ success, data }`), not a value-or-null, so `safeGet` would
set up the wrong expectation for a reader who knows zod. "Safe" is also a vague
quality word — safe from what? `maybeGet` states the one thing that is true.

The database driver's probe export follows: `maybeGetDatabaseDriver`.

## `build` runs the sequence inline

0068's `registerBackends` and `registerPluginRuntime` were thin wrappers in
`registrations.ts` over what is a fixed, linear boot. They named a sequence
without abstracting one, so the composition root read as a list of opaque calls
and the boot order — the thing a reader comes here to see — was hidden a file
away. `build` now runs that sequence inline, top to bottom: fill the backend
slots, verify the schema, register the jobs and plugin runtime, boot, assemble.
`registrations.ts` is deleted.

`registerBuiltInJobs` survives as a call, now a local helper in `astromech.ts`.
It is kept not because it hides complexity but because it is the extension point:
each domain that ships a built-in cron job adds it there, so `build` does not
grow a line per domain (the reason 0068 introduced it). Every other step is a
fixed one-time wiring with nothing to grow, so it reads inline.

Rejected: **keep `registerPluginRuntime` as a named step** (it has the host
storage-override loop and the manifest generation). Its internals carry their own
comments and inline fine; giving them a wrapper bought a name, not an
abstraction, and cost the top-to-bottom read.
