# Handoff — AI authoring P0a + P0

For a fresh coding agent. Read `specs/ai-authoring-foundation.md` first for *why*;
this document is *what to do*. Scope is **P0a and P0 only** — stop at the end of
P0 and hand back. Do not start P1.

**Branch:** create `feat/service-descriptor-normalisation` in its own worktree
whose directory name matches the branch. Fork from `main`. Do not work in the
shared main checkout — other agents are active there.

---

## Before you start

Run these and record the answers; several numbers below are deliberately not
stated because they were true in a previous session and may have moved.

```sh
git -C <worktree> rev-parse --abbrev-ref HEAD    # confirm you are on the branch
npm run build                                     # plugin packages must be built
npm run test:run                                  # record the baseline test count
npm run typecheck && npm run lint && npm run lint:deps
```

Then regenerate the manifest and keep it as your before-picture:

```sh
npm run generate:manifest   # or: astromech generate:manifest
cp apps/demo/.astro/astromech.methods.json /tmp/manifest-before.json
```

Notes that will bite you if you skip them:

- `apps/demo` has **no typecheck script**; the root one covers it.
- Plugin packages have **no lint script**, but the pre-commit hook lints them.
- Never `--no-verify`.
- A worktree needs its own `npm install` and built `dist` before the demo will run.

---

## P0a — normalise every service method to a parameter object

**Goal:** one calling convention across the whole service layer. Entries already
uses parameter objects; core does not. This is a prerequisite for everything in
P0 and P1.

**This is a mechanical, behaviour-preserving change. Do it as its own commit with
nothing else in it.** If you find yourself changing logic, you have gone too far.

### Current signatures (verified 2026-07-30)

In `packages/astromech/src/types/api.ts` and the matching `*/service.ts`:

| Domain | Now | Becomes |
|---|---|---|
| users | `query(params?)` | unchanged |
| users | `get(id)` | `get({ id })` |
| users | `create(data)` | `create({ ...data })` |
| users | `update(id, data)` | `update({ id, ...data })` |
| users | `delete(id)` | `delete({ id })` |
| media | `query(params?)` | unchanged |
| media | `get(id)` | `get({ id })` |
| media | `upload(file)` | `upload({ file })` |
| media | `update(id, data)` | `update({ id, ...data })` |
| media | `delete(id)` | `delete({ id })` |
| settings | `all(opts?)` | unchanged |
| settings | `get(key, opts?)` | `get({ key, ...opts })` |
| settings | `set(key, value)` | `set({ key, value })` |

Confirm this table against the code before editing — read
`types/api.ts` plus `users/service.ts`, `media/service.ts`, `settings/service.ts`.
Notifications is a fourth domain with its own shape; include it if it has
positional methods, and note what you found either way.

Decide `update` deliberately: `update({ id, ...patch })` flattens, whereas entries
uses `update({ type, id, data })` with a nested `data`. **Match entries — use a
nested `data`** (`update({ id, data })`) so one convention really does mean one
convention. Say so in the commit message.

### Call sites to update

Find them all rather than trusting this list:

```sh
rg -n "\b(usersApi|mediaApi|settingsApi)\b" packages apps
rg -n "getUsersApi|getMediaApi|getSettingsApi" packages
```

Expect: `transport/http/routes/{users,media,settings}.ts`,
`transport/cli/commands/*`, `transport/mcp/dispatch.ts`, the admin fetch client
under `packages/astromech/src/admin`, plugin `ctx` wiring in
`plugins/runtime/plugin-runtime.ts`, seeds, and tests.

**Watch for the settings-`full` wrapper.** `ctx.settings` and `ctx.entries` are
wrapped with a full-shape default (`withDefaultSettingsShape` /
`withDefaultShape` in `plugins/runtime/plugin-runtime.ts`). Those wrappers
inspect and inject an options object — if you change the argument position they
read from, plugin reads silently change shape. This is the single most dangerous
part of P0a. Verify a plugin still reads its own settings at full shape
afterwards.

### Done when

- `npm run test:run` is at or above the baseline you recorded, with no skips added.
- `npm run typecheck && npm run lint && npm run lint:deps` clean.
- `npm run build` clean (bump `NODE_OPTIONS` heap if the DTS worker OOMs).
- `diff /tmp/manifest-before.json` on a fresh manifest shows **no change** —
  P0a alters signatures, not the manifest.
- Demo boots and an entry list, a user edit, and a settings save all still work.

Commit: `refactor(services): normalise every service method to a parameter object`.

---

## P0 — the descriptor describes the method, not the HTTP body

**The defect.** `ServiceMethodDescriptor.input` is populated with the route's
*body* schema, so it omits path params. `settingsDescriptors.set.input =
setSettingSchema` = `{value}`, but the method is `set(key, value)`. `media.update`
and `users.update` both omit `id`. Result: 67 of 71 manifest methods carry no
usable schema, and MCP's `users.update` tool has hand-written schema that already
dropped `fields` and the email format.

Work through these in order; each is independently committable.

### 1. `input` becomes the full call schema

Compose it from the existing body schema rather than inverting the routes:

```ts
// packages/astromech/src/users/descriptors.ts
update: {
    name: 'users.update',
    input: updateUserSchema.extend({ id: z.string() }),
    // ...
}
```

Routes keep calling `updateUserSchema.safeParse(raw)` verbatim — no route churn,
and the `@hono/zod-openapi` `.openapi('UpdateUser')` component registrations stay
intact. **Verify `.extend()` on a registered schema doesn't double-register a
component name**; if it does, extend a pre-`.openapi()` base instead.

Cover all four catalogues: `users/`, `media/`, `settings/`, and whatever
notifications needs.

### 2. Real descriptors for entries

Today entries methods are synthesised structurally from `ENTRY_METHODS`
(`codegen/method-manifest.ts:122-142`) and carry no schema. Give them descriptors
so `entries.update` has one. `entries/schema.ts` already exports
`createEntrySchemaFor(titleField)` and `updateEntrySchemaFor(titleField)` — use
them, per type.

**Keep `entryPermission()` as the permission source.** That derivation is correct
and shared with the routes; do not duplicate it.

### 3. Stable unique ids

`name` is not an identifier — `entries.create` is the name for *every* entry type,
and identity is currently `name` + `entryType` + `mount`, recovered by
`manifest.name.split('.')` in `transport/mcp/dispatch.ts:565,570`.

Add an `id` field that is genuinely unique: `entries.posts.update`,
`plugin.redirects.lookup`, `users.update`. Delete both `split('.')` sites.

### 4. Export `ManifestMethod` as a discriminated union

It is currently unexported (`codegen/method-manifest.ts:47`) and its shape is
hand-copied **five** times: `transport/mcp/dispatch.ts:41-52`,
`transport/mcp/tools.ts:23-34` (name-colliding and structurally divergent),
`transport/mcp/server.ts:19-33`, `transport/mcp/index.ts:14-28`.

Export it, discriminate on `source`, and delete all four copies:

```ts
export type ManifestMethod =
    | { source: 'core'; /* ... */ }
    | { source: 'entries'; entryType: string; mount: string; /* ... */ }
    | { source: 'plugin'; plugin: string; access: PluginAccess; /* ... */ };
```

Note `codegen/` importing into `transport/` may cross a dep-cruiser boundary —
check `lint:deps` and put the type where the rule allows.

### 5. Small fixes in the same area

- Add `input`/`output` to `PluginServiceMethod` (`types/plugins.ts:140-149`).
  A plugin author currently cannot declare a call schema at all.
- Derive `name` from the catalogue key and delete the `?? '(unnamed)'` fallback
  (`codegen/method-manifest.ts:190`) — a typo currently produces a manifest entry
  called `(unnamed)` with no build failure.
- Remove `contentSchema` (`codegen/method-manifest.ts:85`). It is always `null`
  and the plan no longer needs it — content operations consume field schemas
  server-side. Bump the manifest `version` if you consider the removal breaking.
- Add `required` where emitted schemas lack it, so `strict: true` becomes usable
  later. `additionalProperties: false` is already emitted.

### 6. The parity test — do not skip this

Add a test asserting **every** MCP tool's `inputSchema` deep-equals its
descriptor's serialized `input`. The absence of exactly this test is why the
`users.update` drift shipped and sat there unnoticed.

Expect it to fail first against the hand-written adapters in
`transport/mcp/dispatch.ts`. Fix the adapters to read `manifest.input` rather than
weakening the test. Where an adapter's literal genuinely must differ, make the
test assert that explicitly with a comment saying why — do not add a blanket skip.

### Done when

- The parity test passes and fails if you deliberately break one schema.
- A fresh manifest shows `input` populated for **every** method (the before-picture
  had 4 of 71). Print the count in the commit message.
- No `split('.')` remains in `transport/mcp/`.
- Only one declaration of the manifest method type exists in the repo.
- Full gate green: `test:run`, `typecheck`, `lint`, `lint:deps`, `build`.
- `astromech methods --json` and `astromech mcp`'s tool list still work — dogfood
  both, don't just trust the tests.

---

## Rules

- **Do not** touch `packages/astromech/src/context/index.ts`,
  `policies/with-permissions.ts`, or anything in `entries/operations/preview/`.
  Those are P2–P4 and are deliberately out of scope.
- **Do not** build the confirm gate, content operations, context bus or chat
  drawer. P1–P7 belong to later handoffs.
- Do not `--no-verify`. Do not commit to `main`. Do not merge.
- If the plan turns out to be wrong — and the calling-convention finding was
  itself discovered by trying to write this handoff, so assume something else is
  lurking — stop and report rather than improvising a redesign.

## Report back with

1. The test baseline before and after.
2. How many of the 71 methods carry an `input` schema after P0.
3. Whether `.extend()` on an `.openapi()`-registered schema caused component
   problems.
4. Anything the parity test surfaced beyond the known `users.update` drift.
5. Whatever you found about notifications' shape.
