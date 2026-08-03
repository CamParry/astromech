# AI authoring — foundation fixes and the WS4–6 rebuild

**Status:** planned, nothing built. Supersedes the WS4–6 sections of
`specs/ai-integration.md`, which that file already marks as design history.
Delete this spec once the work ships.

**Why now:** WS1–3 (admin UI slots, CLI, MCP) shipped 2026-07-28. Before building
the confirm gate, context bus and authoring plugin on top, four defects in the
shipped substrate need fixing. All four are refactors of existing code — fixing
them _deletes_ code and shrinks WS4–6. Nothing is deployed, so this is the
cheapest moment to do it.

---

## 1. The four defects

### D1 — The descriptor describes the HTTP body, not the method

`ServiceMethodDescriptor.input` (`types/services.ts`) is populated with the
route's **body** schema, so it omits every path parameter:

- `settingsDescriptors.set.input = setSettingSchema` → `{value}`; the method is
  `set(key, value)`.
- `mediaDescriptors.update.input` → `{alt,title,fields}`; no `id`.
- `usersDescriptors.update.input` → four fields; no `id`.

Consequences, all verified against `apps/demo/.astro/astromech.methods.json`
(71 methods: 49 entries, 13 core, 9 plugin):

- **67 of 71 methods carry no `input` at all.** Only `media.update`,
  `settings.set`, `users.create`, `users.update` have one.
- **`name` is not unique.** `entries.create` is the name for every entry type;
  identity is `name` + `entryType` + `mount`. Two consumers recover a key by
  string-splitting (`transport/mcp/dispatch.ts:565,570`).
- **No link from a manifest entry to a callable**, so dispatch is hand-written.
- **It has already caused live drift.** Because `manifest.input` for
  `users.update` lacks `id`, the MCP schema was hand-written
  (`transport/mcp/dispatch.ts:160-183`) and dropped `fields` and the email
  format. It declares `additionalProperties: false` with no `fields`, so setting
  a custom user field through MCP is rejected. The correct schema sits in the
  manifest, unread. No test asserts parity.

**And there is a deeper blocker underneath it: the two halves of the service layer
use different calling conventions.** Verified in the implementations, not just
`types/api.ts`:

- Core is **positional** — `users.update(id, data)`, `users.get(id)`,
  `settings.set(key, value)`, `media.update(id, data)`, `media.delete(id)`.
- Entries is a **parameter object** — `entries.update({type, id, data})`,
  `entries.get({...})`.

So even a perfect JSON Schema wouldn't let a generic dispatcher call
`users.update`: it would have no way to know the input splats into two positional
arguments. This — not the missing schemas — is the real reason
`transport/mcp/dispatch.ts` is a pile of hand-written adapters, and it must be
resolved for P1 to be possible at all.

**Decision (2026-07-30): normalise every service method to a parameter object**,
matching the entries precedent. `users.update({id, ...patch})`,
`settings.set({key, value})`, `media.delete({id})`. Dispatch then becomes
`service[method](input)` with no per-method knowledge at all, and the descriptor's
`input` schema _is_ the argument — one shape, no mapping layer.

A descriptor-declared argument mapping (`args: ['id','data']`) was considered and
rejected: it is a smaller diff but it adds a second concept whose only job is to
paper over the inconsistency, and it leaves two calling conventions in the
codebase permanently.

**Sequencing caution.** This touches every core method and every call site —
routes, CLI, MCP, the admin fetch client, plugin `ctx`, seeds, tests. Three
workstreams are in flight (`feat/nested-field-validation`,
`feat/storage-layer-follow-ups`, relationships), and the validation work has
already touched `users`/`media`/`settings` service files. Land the normalisation
as its own mechanical commit — signature change and call-site updates only, no
behaviour change — so conflicts stay trivially resolvable, and ideally after
`feat/nested-field-validation` merges.

Related, same layer:

- `PluginServiceMethod` (`types/plugins.ts:140-149`) has **no `input`/`output`
  field at all** — a plugin author cannot declare a call schema.
- `buildDispatch` returns `null` for `source === 'plugin'`
  (`transport/mcp/dispatch.ts:554-558`), yet the handlers exist one call-frame
  away: `transport/mcp/index.ts:34-38` loads `raw.plugins` (each
  `service[key].handler`), feeds it to the generator, then discards it.
- `ManifestMethod` is **not exported** (`codegen/method-manifest.ts:47`), so its
  shape is hand-copied five times: `dispatch.ts:41-52`, `tools.ts:23-34`
  (name-colliding and structurally divergent), `server.ts:19-33`,
  `mcp/index.ts:14-28`. It is also flat, with `entryType?`/`mount?`/`access?`
  and `// Present when source === 'entries'` comments the compiler ignores.
- `descriptor.name ?? '(unnamed)'` (`codegen/method-manifest.ts:190`) — a missing
  name yields a manifest entry called `(unnamed)`, no build failure. The
  catalogue key and the `name` string duplicate the same fact by hand.

### D2 — Request context is a mutable module-level variable

`context/index.ts:13` — `let currentUser: User | null = null`, mutated by
`setCurrentUser`. It backs the HTTP server's per-request user. Two concurrent
requests in one process or isolate can read each other's identity.

Everything in the AI security model — the agent acting as the requesting user —
sits on this. Also check whether it is hit by the known chunk-duplication
problem (this repo has a `globalThis.__astromech*` pattern for module-level
singletons): if `setCurrentUser` and `getCurrentUser` resolve into different
tsup chunks they mutate different variables.

### D3 — The public-shape write-back guard cannot protect the agent path

A guard **does** exist, and it works in-process: `markPublic()` stamps a
non-enumerable `Symbol` brand on public-shape reads (`entries/visibility.ts`),
and `create`/`update` throw `PublicShapeWriteError` when they see it
(`entries/operations/update.ts:150`, `entries/operations/create.ts:33`).

But the brand is **object identity**, and it does not survive serialization. The
agent path is definitionally a serialize-and-reconstruct boundary: MCP returns
tool results through `JSON.stringify` (`toToolResultText`,
`transport/mcp/server.ts:47-49`), the model reads text, then builds a _fresh_
input object for the next call. `isPublicBranded` sees a plain object and the
guard stays silent.

Combined with reads defaulting to the public projection, and `full` exposed on
entries `get`/`query` (`transport/mcp/dispatch.ts:456`, `362-376`) but **not** on
`update` — with nothing in any schema signalling that a read needs `full: true` —
an agent that reads without it and writes back converts rich text from
ProseMirror JSON into an HTML string, with the guard structurally unable to fire.
"Translate this page" is exactly that read-modify-write shape.

This is the strongest argument for content operations: they keep field data
server-side and in-process, where the brand does work.

### D4 — `withPermissions` is a predicate, not a wrapper

`policies/with-permissions.ts` returns `allows`/`allowsMethod` — a guard you must
remember to ask. Its own docblock says the rule should be "you can't do what you
weren't handed," but what shipped is "everything unless you remember to say
don't." A new consumer gets no structural protection, and `ToolDispatch`
(`transport/mcp/dispatch.ts:32-38`) has no principal parameter to hang a check on.

### Verified sound — do not re-litigate

- **Permission parity.** Core routes enforce
  `allowsMethod(<domain>Descriptors.<method>)`, so the manifest's permission _is_
  the enforced value. Entries synthesise an ad-hoc descriptor from
  `entryPermission(type, action)` (`transport/http/routes/entries.ts:75-79`) —
  the same shared helper the manifest imports. `entry:*` provably cannot reach
  `plugin:<ns>:entry:…`.
- **Effect hints** are single-sourced; `mutates` is a compile error if omitted.
- **MCP tool names** do not collide (the adapter rebuilds
  `entries_<type>_<action>`), and `createStaged` does not misdispatch to `update`
  (the adapter parses the method name, not the permission action).
- **Preview token crypto.** 32 bytes from `crypto.getRandomValues`, SHA-256 at
  rest, looked up by `(entryId, hash)` so a token cannot cross entries,
  projection hard-pinned to `shape: 'public'` even though the publish gate is
  bypassed.
- **MCP stdio discipline.** Diagnostics go to stderr only; stdout stays a clean
  JSON-RPC channel. Nothing logs secrets.
- **Slot `permission`** is visibility-only, and the real enforcement path uses
  the same derivation.

### Lower severity, worth fixing in passing

- Preview tokens never expire by default (`entries/operations/preview/token.ts:31`
  passes `expiresAt ?? null`; `isValid` treats null as forever). Matters because
  the gate hands out preview links — see P3.
- Nothing stops `astromech mcp` being pointed at a production database
  (`transport/cli/config.ts` calls `db.getInstance()` on whatever resolves; the
  D1-in-Node failure is accidental, not a guard).
- `resolveAssetSpecifier`'s `file:` branch does not bound `../` traversal at
  codegen time (`codegen/plugin-client-manifest.ts:31-41`) — trusted input today,
  but inconsistent with its sibling branch, which deliberately leaves `../` to
  fail loudly.
- Notifications cannot be expressed: its permission is _identity_-derived (off
  the caller's session), and `PermissionRule` models only static or
  input-derived. Document the third category.

---

## 2. Decisions locked 2026-07-30

### MCP: borrow the shape, don't chase the wire format

The spec was revised 2026-07-28 — stateless core, and **MRTR** replaces
server-initiated requests (return `resultType: 'input_required'` with the
requests you need; the caller retries with `inputResponses`). The pinned SDK
(`@modelcontextprotocol/sdk` 1.29.0) tops out at protocol `2025-11-25`, and real
clients track the SDK, so speaking the new revision ahead of it would make us
_incompatible_ with the clients this serves. MCP is dev-only scaffolding here,
so protocol currency is low-stakes. The deprecations (Sampling, Roots, Logging,
HTTP+SSE) touch nothing we use — we are stdio only.

**So:** the confirm gate's internal contract adopts the MRTR shape and
elicitation's three actions (`accept` / `decline` / `cancel`). The MCP transport
keeps speaking whatever the SDK speaks. When the SDK catches up the transport
swap is mechanical, because the gate is already the right shape.

No server-side staged-action store, no TTL, no session id.

### The confirm gate is a brake, not a boundary — reframed 2026-08-02

The "stateless, no store" lock above stands, but the reasoning under it was
wrong, and it mattered: a stateless gate **cannot distinguish a human's approval
from a caller fabricating one**. The answer is just a value the caller supplies.
§3.12's "holds it until an explicit human click" is not something a stateless
gate can promise.

Researched how vendors with sensitive data actually handle this. Three findings:

- **Authorization is the boundary; confirmation is not.** Sentry's remote MCP
  chains MCP OAuth → Sentry OAuth, presenting _Skills_ (capability bundles)
  rather than raw scopes because its own scopes are too coarse for the MCP
  capability model. Cloudflare Access gates which tools an identity may call
  before any tool runs.
- **Capability reduction is the convergent safety lever.** GitHub's MCP server
  ships `--read-only` as "a strict security filter that takes precedence over any
  other configuration, disabling write tools even when explicitly requested",
  plus toolsets / excluded tools / lockdown mode. Stripe's has `--read-only`.
  This is structural where an annotation is advisory — and it is the piece we
  did not have.
- **When a server genuinely needs proof, the protocol's answer is URL mode, not
  a nonce.** MCP URL-mode elicitation issues an `elicitationId`, the client
  redirects the user OUT, and completion "must be tracked and validated by the
  server, not inferred from client behavior". A client accepting means only that
  it displayed the message and began navigating. Same shape as GitHub sudo mode
  and S3 MFA-delete: **the proof arrives on a channel the requester does not
  control.**

**So the axis is not stateless vs stateful — it is which channel the approval
arrives on, which the access point decides:**

| Access point      | Caller                        | Where a human can be                    |
| ----------------- | ----------------------------- | --------------------------------------- |
| MCP / stdio       | a local MCP client            | in the client; dev-only regardless      |
| CLI               | a developer at a terminal     | the terminal                            |
| Admin chat drawer | our own server-side tool-loop | the admin UI — real session, real click |

For the first two, stateless in-band confirm is correct and is what the
ecosystem does. For the third, approval need not be inferred from the caller at
all: the drawer is served by our own admin app over an authenticated session, so
a confirmation is an ordinary authenticated request from a browser. That is
stronger than a stateful gate, not weaker.

And the out-of-band half already exists. Forward versioning shipped staged
entries + preview tokens: stage server-side, human opens the preview in admin,
merge runs as an authenticated admin action. That IS URL mode, server-validated.
Content ops (P5) route through it; P3 adds no new mechanism for it.

A signed nonce was considered and **rejected**: it proves a round-trip happened,
not that anyone saw it, while carrying the state cost of the thing that would.

**Cautionary tale, directly on our path:** CVE-2026-48529 against GitHub's MCP
server — the lockdown cache was a process-global singleton initialised with the
FIRST authenticated user's client, so every later user's queries ran with that
user's credentials. That is the bug class P2 removed. The gate must not keep
state in a module-level map either.

### Tool-loop alone does not hold — split by whether field data is involved

`specs/ai-integration.md` §3.13 locked "a tool-loop over the manifest, not
pre-declared operations." That holds for the long tail and fails for content
authoring, for two reasons already in the code: the model has no idea what a
`post` is (D1), and every content edit is a read-modify-write, which is the
operation that corrupts rich text (D3).

- **Tool-loop over the manifest** — the long tail. `users.create`,
  `media.delete`, `settings.set`, `entries.publish`/`trash`/`restore`, plugin
  methods. Flat arguments, discrete effects.
- **Content operations** — anything writing entry field data. `translate`,
  `transform`, `generate`, each taking a target (type + id + optional field
  paths) plus an instruction.

The safety argument, not just tidiness: **a content operation runs server-side so
field data never passes through the model's context as a payload it must
reconstruct.** It reads at full shape, works field by field against each field's
own schema, and writes back through the normal validation pipeline. That kills
D3 structurally rather than by hoping the model passes `full: true`.

It also makes the two gate mechanisms follow the operation class rather than
being an awkward split: content ops produce a staged entry → review link (URL
mode); tool-loop ops get a flat confirm dialog (form mode).

### Drop `contentSchema` from the manifest

`codegen/method-manifest.ts:85` ships an always-`null` field into a `version: 1`
on-disk artifact. With content ops owning content, the field schema is consumed
server-side inside the op and never shipped to the model, so the manifest does
not need it. Remove the field rather than fill it.

### Tool surface sizing

71 methods at ~4.7k tokens _without_ schemas; real schemas would balloon it. Use
`tool_search_tool_regex_20251119` (or `_bm25`) with `defer_loading: true` on the
rest — discovered schemas are appended rather than swapped, so the prompt cache
survives. Tools render at prompt position 0, so the tool list must stay
byte-stable and sorted (the generator already sorts).

---

## 3. Phases

Each phase leaves the suite green. Re-baseline the test count at P0 start rather
than trusting a number from an earlier session.

### P0 — Descriptor describes the method

- `types/services.ts`: `input` becomes the schema of the **full call**
  (`{key, value}`, `{id, ...patch}`) rather than the HTTP body.
- **Compose it from the existing body schema; don't invert the routes.**
  `input: updateUserSchema.extend({ id: z.string() })` keeps
  `updateUserSchema` as the single authored source, leaves every route untouched
  (they call `createUserSchema.safeParse(raw)` directly today), and avoids
  disturbing the `@hono/zod-openapi` `.openapi('UpdateUser')` component
  registrations. Check that `.extend()` on a registered schema doesn't
  double-register a component name.
- **P0a, first and on its own:** normalise every core service method to a
  parameter object (see above). Mechanical, no behaviour change, own commit.
- Add `id` to `ManifestMethod` — a stable unique key (`entries.posts.update`,
  `plugin.redirects.lookup`). Stop string-splitting in
  `transport/mcp/dispatch.ts`.
- Give entries real descriptors instead of structural synthesis from
  `ENTRY_METHODS`, so `entries.update` carries a schema. Keep
  `entryPermission()` as the permission source — that part works.
- Export `ManifestMethod` as a **discriminated union** on `source`; delete the
  four hand-copied slices in `transport/mcp/{dispatch,tools,server,index}.ts`.
- Derive `name` from the catalogue key; delete the `?? '(unnamed)'` fallback.
- Add `input`/`output` to `PluginServiceMethod` (`types/plugins.ts`).
- Remove `contentSchema`.
- Add `required` to emitted schemas where missing so `strict: true` is usable
  (`additionalProperties: false` is already emitted).

**Verify:** a test asserting every MCP tool's `inputSchema` equals its
descriptor's serialized `input`. This is the test whose absence let the
`users.update` drift ship.

### P1 — Generic dispatcher

- Replace the per-domain adapters in `transport/mcp/dispatch.ts` with one
  dispatcher driven by the manifest `id` + a runtime handler registry.
- Thread `raw.plugins` from `transport/mcp/index.ts` through
  `createMcpServer`/`buildTools` so plugin methods dispatch off
  `def.service[key].handler` instead of returning `null`.
- Closes three backlog items as a side effect: plugin methods, the entries
  long-tail (duplicate/trash/restore/versions/staging/preview/schedule), and
  notifications once it has a descriptor catalogue.

**Verify:** `astromech methods --json` and the MCP tool list agree on count and
names; no `skipped[]` entries except deliberate ones, and those are logged.

### P2 — Request-scoped context and a real permission wrapper

- `context/index.ts`: `AsyncLocalStorage` instead of the module variable. Audit
  every `getCurrentUser()` call site.
- Add `scopedService(principal)` returning a service handle where every method
  enforces its descriptor's permission. Keep `allows`/`allowsMethod` for route
  checks that need custom logic (the `users.get`-or-self case).
- Add a `permission` passthrough on `ToolDispatch` so the seam exists before a
  remote transport needs it.
- Annotate the manifest per-principal (visible-but-denied, `ai-integration.md`
  §3.10) — this is the deferred piece `roadmap/completed/method-manifest.md`
  names.

**Verify:** a test that a scoped handle refuses a method the principal lacks,
and that two interleaved requests never observe each other's user.

### P3 — Reduction, then the confirm gate

Three layers, in value order. See "The confirm gate is a brake, not a boundary"
in §2 for why reduction comes first.

**Layer 1 — reduced tool surface (new; the highest-value piece).** A read-only /
reduced projection of the manifest, following the GitHub–Stripe convergence.
`readOnly` is a STRICT filter that overrides an explicit include, per GitHub's
semantics — copy them, they are load-bearing. Cheap now: `mutates` is on every
descriptor and `scopedService` already composes. Surfaces as `--read-only` on
`astromech mcp` and `astromech methods`, and excluded methods are logged with a
reason the way P1's skips are.

**Layer 2 — stateless MRTR confirm gate.** A mutating call returns
`{status: 'input_required', requests: [...]}`; the caller re-invokes carrying an
answer. Three actions: `accept` / `decline` / `cancel`. Documented in the code as
a runaway-loop brake, NOT a security boundary — permissions are the boundary.
Trigger is a predicate over the descriptor with named presets (`'mutating'`
default, `'destructive'`), not a hardcoded rule.

**Layer 3 — out-of-band approval. No new mechanism.** Staged entries + preview
tokens already are URL mode. Content ops route through them at P5; the admin
path gets its human from the session, not the protocol.

Also here: default preview tokens to a TTL (they never expire today —
`token.ts` passes `expiresAt ?? null` and `isValid` treats null as forever), and
that matters because the gate hands out preview links.

**Verify:** a declined and a cancelled call both leave state untouched and are
distinguishable by the caller; `--read-only` refuses a mutating method even when
that method is explicitly included.

### P4 — Read-shape contract across the wire

> **SUPERSEDED 2026-08-02 by the research recorded in
> `roadmap/in-progress/ai-integration.md`.** The payload-marker approach below
> was investigated and rejected — no one solves this with a marker; two
> structural levers do. P4 split accordingly: **P4a** (validation on the way in)
> shipped 2026-08-03, and **P4b** (`update` becomes PATCH-only) is the open item.
> The `_shape` key survives as a diagnostic only and must not enforce. Read the
> roadmap file, not this section, before building. Kept as design history.

The `Symbol` brand cannot cross a serialization boundary, so the guard needs a
wire-safe counterpart for the agent path:

- Declare the required shape on the descriptor: a mutating method that consumes a
  prior read states which shape it needs.
- Have reads that cross the wire carry their shape **in the payload** (an explicit
  field, not a brand) so the dispatcher can reject a write assembled from a
  public-shape read. Keep the in-process `Symbol` brand as the belt-and-braces
  layer it already is.
- Expose `full` consistently on the agent-facing read tools, or make it moot by
  having content ops own the read entirely.

**Verify:** a rich-text round-trip through the agent path preserves ProseMirror
JSON, and a write assembled from a public-shape read is rejected _after_ crossing
JSON. This is the regression test for D3 and it must exercise the serialized
path — an in-process test passes today and proves nothing.

### P5 — Content operations

`translate`, `transform`, `generate`. Server-side, schema-aware, staged output.
Reuse the field descriptors and the validation pipeline.

**Designed out in `specs/ai-content-operations.md` (2026-08-03) — read that, not
this.** Two findings there that this section does not know: HTML cannot be parsed
back to ProseMirror server-side (tiptap's parser needs a DOM), so `translate`
never serializes the document at all and works block by block; and the provider
registry has to resolve lazily, because `config:setup` is build time and does not
re-run per request in a Worker.

### P6 — Context bus

Ambient reference `{kind, type?, id?, label}` published by the route, per
`ai-integration.md` §3.14/§3.22. Independent of everything above.

**Constraint the original spec does not know:** ambient context must **not** go
in the system prompt or the tool list — a route change would invalidate the whole
cached prefix on every navigation. Put it in a `role: 'system'` message inside
`messages[]` (supported on Opus 5 / 4.8, no beta header), after the last cache
breakpoint.

### P7 — Authoring plugin

Claude adapter + chat drawer. Notes:

- Use `client.beta.messages.toolRunner()`. Its per-turn hooks _are_ the approval
  gate — gate inside the tool's `run`, or intervene on the yielded assistant
  message before tools execute. No manual loop needed.
- `betaTool()` takes raw JSON Schema, which is what the manifest already emits —
  no Zod round-trip.
- Stream over a `rawRoute` (raw routes are streaming-only, which is exactly their
  sanctioned use).
- Default `claude-opus-5`; `effort` configurable. BYO key via plugin `env`,
  server-side only — never to the browser.
- The admin slot system (`admin/components/plugins/PluginSlot.tsx`,
  `app-shell.tsx`, `topbar.tsx`) has **zero consumers today**. The chat drawer
  will be its first real contribution; expect breakage that only browser-verify
  catches.

---

## 4. Open

- Whether `notifications` gets a descriptor catalogue with an identity-derived
  permission rule, or stays deliberately outside the manifest with that
  documented.
- Whether the production-database guard on the CLI/MCP transport is a warning, a
  `--force`, or a driver allowlist.
