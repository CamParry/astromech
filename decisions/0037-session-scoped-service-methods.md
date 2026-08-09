# 0037 — A method whose subject is the caller declares `sessionScoped`

**Date:** 2026-08-09
**Status:** accepted

A `ServiceMethodContract` could say what permission a method needs and what it
does to state, but not that one of its arguments comes from the caller's
identity rather than the caller's input. `transport/http/routes/notifications.ts`
states the model in prose — "session-scoped; no permission contracts; ownership
enforced via userId in every query" — and prose is where it stayed, because there
was no field to put it in. So notifications had four live HTTP routes and no
manifest presence at all: no permission, no MCP tool, no CLI reach, nothing for
the assistant to call.

A contract now declares `sessionScoped: true`. It means: this method acts on the
caller's own rows, its `userId` argument is filled from the request context by
`policies/scoped-services.ts`, and a caller-supplied `userId` is overwritten
rather than trusted. The `input` schema omits `userId` — it is not the caller's
to pass.

The pinning is not a convenience. Such a method declares no permission, because
"you may read your own notifications" is not a grant anyone hands out; the
subject is the whole of the authorization. An input-supplied `userId` on a method
with no permission gate is an impersonation hole with nothing between it and the
rows. `policies/scoped-services.ts` already had the shape for this: `scopeEntries`
pins the entry type it derives a permission from for the same reason, so a caller
cannot redirect a call at a type it lacks.

## Where the fill happens: the scoped handle, not the dispatcher

`transport/tools/dispatch.ts` was the other candidate, and it is where
`entriesArgs` pins the entry type. It loses because `scopedServices(role)` is
handed to untrusted callers directly, not only through a tool: filling in the
dispatcher would leave `handle.notifications.list({ userId: someoneElse })`
reachable by anyone holding the handle. Putting it on `scopeMethods` covers both
paths at the boundary the module is described as being.

A trusted transport with no user refuses the method, with the reason declared,
the way `binaryInput` is. `buildDispatch` — the raw path, serving the dev-only
MCP server and the CLI — returns `{ ok: false, reason: 'session-scoped — this
transport has no user' }` rather than calling on a guessed subject.
`buildScopedDispatch` calls through the handle and needs no special case.

## Rejected: `sessionArgument: 'userId'`

Naming the argument instead of flagging the method is the more general form, and
generality is the only thing it buys. There is no second name in sight: `userId`
is the word for user identity everywhere in this codebase, and a field whose
value is always the same string is a field that can only be got wrong. The
ecosystem's prior art fixes the source too — tRPC's protected procedures read
`ctx.session`, Payload reads `req.user`, Postgres RLS reads `auth.uid()`; none
of them lets a method rename it. If a per-user resource ever keys on something
other than a user id, that is the change that earns the field.

## Rejected: one declaration covering `users.get`'s self-access exemption

`users.get` lets you read yourself without holding `users:read`, and the
temptation is to call that the same fact. It is not. Two things differ:

- **Where the value comes from.** `notifications.list` takes its subject from the
  session. `users.get` takes an `id` from the input and reads any user with it.
- **What is being decided.** `notifications.list` has no permission to waive.
  `users.get` requires `users:read` and waives it for one input.

A single field would have had to mean "fill this from the session" on one method
and "waive the permission when this argument equals the caller" on another,
choosing between them by whether `permission` happened to be present. That is an
inference a reader has to be taught before they can predict what any contract
does, and getting it backwards on a new method fails open. `scoped-services.ts`
already records that self-access and the last-admin guard are identity policy
that stays explicit in the route; this does not move them.

The generalisation that would be right, if a second case appears: a contract
names its subject argument and says whether the value is supplied by the session
or by the input, and the permission is waived when an input-supplied subject is
the caller. One case is not enough to design that against.

## Rejected: leaving notifications out of the manifest

The status quo, and the reason for the record. It is defensible for exactly as
long as nobody notices — a domain with routes and no contract is invisible to
every surface built on the manifest, and the invisibility reads as "this feature
does not exist" rather than as a deliberate omission.

## What it does not change

`MethodManifest.version` stays 2. `sessionScoped` is emitted only when true, so
every existing document is still valid and a consumer that ignores the field
behaves as it did — the same additive shape `binaryInput` has.

The flag carries no permission. A session-scoped method is reachable by any
signed-in caller, including one with no role at all, and that is the model the
notifications routes already enforced: authority comes from having a session, not
from what the role holds.
