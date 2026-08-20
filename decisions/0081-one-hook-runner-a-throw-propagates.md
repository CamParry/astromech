# 0081 — One hook runner; a throw propagates; hooks are not a plugin concept

**Date:** 2026-08-21
**Status:** accepted

Hooks live in their own leaf, `hooks/`, with `subscribe(event, handler)`,
`emit(event, payload)` and `hasSubscribers(event)`. There is one runner. A
handler's return value, when not `undefined`, replaces the payload for the next
handler and is what `emit` returns. A handler throw propagates to the caller
from the point `emit` was called, whatever the event is named. The plugin
runtime is one subscriber among any.

## Context

The hook system lives in `plugins/runtime/plugin-runtime.ts`: the registry, two
dispatchers and the public `runBeforeHooks` / `runAfterHooks` / `emitEvent`.
The only way to register a handler is `PluginDefinition.hooks`, so core cannot
subscribe to its own events, and `ARCHITECTURE.md` has to call the plugin
runtime "the hook engine".

The two dispatchers are identical except that `dispatchAfter` wraps each handler
in try/catch and logs. `emitEvent` picks between them by testing whether the
event name contains `:before`. So the failure semantics of a hook are decided by
a substring of its name, inside the engine, where a handler author cannot see
it. Nothing returns a value; `EntryCreateContext.data` is documented as mutable
in place, `EntryUpdateContext.data` has the same shape with no such promise.

Of the thirteen events declared in `types/hooks.ts`, six (`entry:*`) are fired.
`media:beforeUpload`, `media:afterUpload`, `media:beforeDelete`,
`auth:afterLogin`, `auth:afterLogout`, `api:beforeRequest` and
`api:afterRequest` have no emitter; a subscriber gets nothing.

## What the field does

Checked against source, not docs, on 2026-08-21.

- **Payload** (`collections/operations/create.ts`): `beforeChange` and
  `afterChange` run through the same loop, `result = (await hook(...)) || result`,
  no try/catch on either.
- **Strapi** (`core/database/src/lifecycles/index.ts`): one `run(action, ...)`
  serves every lifecycle event; `await subscriber(event)` in a loop, no
  try/catch anywhere in the file.
- **WordPress**: `do_action` and `apply_filters` both run through
  `WP_Hook::apply_filters`; nothing is caught. Filters chain a return value,
  actions do not; that is the whole distinction.
- **Directus** (`api/src/emitter.ts`) is the exception: `emitAction` is
  fire-and-forget (`void`, not awaited) and logs a rejection. It is a separate
  primitive with a separate name and a signature that cannot return, not the
  same hook with hidden handling.

Three of four use one runner and let a throw propagate. The fourth makes the
difference visible in the API rather than inferring it from a name.

## Decision

- **One runner.** `emit` loops the subscribers in registration order, awaits
  each, and replaces the payload with any non-`undefined` return. No try/catch.
- **A throw propagates, always.** From `emit`, at the line the operation called
  it. The operation does not catch it either. A `before*` throw happens before
  any write and aborts the operation; an `after*` throw happens after commit and
  the write stays. That is WordPress: an email that fails in a save hook does
  not un-save the post, and a developer can catch it where it surfaces.
- **Hooks do not control flow.** They read the payload, may return a replacement,
  may cause side effects, may throw. They cannot cancel a transaction, and the
  engine never decides what a failure means.
- **Placement is the operation's job** and is the only before/after difference.
  `before*` fires before the transaction scope opens; `after*` fires after it
  closes. `decisions/0080-transactions-are-scoped-not-threaded.md` records the
  scope.
- **`hooks/` is a leaf.** It depends on nothing above `types/`. The plugin runtime
  calls `subscribe` for each entry in `def.hooks` at registration and is
  otherwise uninvolved. Core may subscribe to its own events.
- **Every declared event is fired, or it is deleted.** A type for an event with
  no emitter is removed from `types/hooks.ts` until something emits it.

## Rejected

- **Two dispatchers keyed by name.** What exists. The semantic is invisible to
  the handler author, `emitEvent`'s substring test is a naming convention doing
  a type's job, and a custom plugin event named without `:before` is silently
  swallowed.
- **Run `after*` hooks inside the transaction so a throw rolls back.** Payload's
  placement. It makes a failed side effect (an email, a webhook) undo a write
  the user already made, which is the opposite of what an after-hook is for, and
  it lets a hook control flow it should not touch.
- **Swallow and log in `after*` only.** The current behaviour. It trades a
  predictable, catchable error for a log line nobody reads, and it is the one
  place in the codebase where a throw does not throw.
- **Separate `action` / `filter` primitives (WordPress, Directus).** Worth
  considering later if an event that must never carry a return appears. Today
  every event carries a payload, and "ignore the return" is a property of the
  caller, not the engine, so one `emit` covers both.

## Consequences

- `plugins/runtime/plugin-runtime.ts` loses the registry, `dispatchBefore`,
  `dispatchAfter`, `runBeforeHooks`, `runAfterHooks`, `hasHookHandlers` and
  `emitEvent`; `ctx.emit` forwards to `hooks/emit`.
- `entries/internal/hooks.ts` is deleted; operations call `emit` inline per
  `roadmap/planned/flatten-entry-operations.md`.
- `types/hooks.ts` drops the seven unfired events and the header paragraph on
  name-keyed failure semantics.
- `ARCHITECTURE.md` lists `hooks/` as a leaf and stops describing the plugin
  runtime as the hook engine.
