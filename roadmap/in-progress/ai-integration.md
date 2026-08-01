# AI integration

Builds on the services/transport seam. Method manifest (the discovery linchpin)
shipped first — see `completed/method-manifest.md`; CLI/MCP/confirm-gate/authoring
all read it.

**Plan:** `specs/ai-authoring-foundation.md` (2026-07-30). It supersedes the
WS4–6 sections of `specs/ai-integration.md`, which that file already marks as
design history.

## Shipped (2026-07-28)

- [x] **UI-slot injection** — named admin-shell slots (`global-overlay`,
      `right-drawer`, `toolbar`) that plugins contribute components into.
      _Zero consumers so far; the chat drawer will be the first._
- [x] **CLI rebuild** — entry create/update/publish/unpublish + JSON output, plus
      a `methods` command that reflects the manifest. Trusted transport (no eval).
- [x] **MCP server** — dev-only in-tree transport (`transport/mcp`, `astromech mcp`);
      projects manifest methods as MCP tools over stdio (core + 7 entry actions in
      v1; plugin methods / media upload / entries long-tail backlogged — P1 closes
      these).

## Foundation — a 2026-07-30 audit found four substrate defects

Fix before building on top. All four are refactors that _delete_ code and shrink
the rest; nothing is deployed, so this is the cheapest moment. Full detail with
file references in the spec.

**P0a and P0 landed 2026-07-31.** The audit's counts were stale: the manifest is
83 methods, not 71. P1 is the next piece of work and has no handoff written yet.

- [x] **P0a — normalise every service method to a parameter object.** Shipped
      2026-07-31 (`934f1d0`). `update` takes a nested `data` (`update({id, data})`)
      matching the entries precedent, not a flattened `{id, ...patch}`. The
      manifest was byte-identical before and after, which is what proved the
      commit changed signatures and not semantics. `notificationsRepo` stays
      positional deliberately — it is a userId-explicit internal repository at the
      storage layer, not a service API.
- [x] **P0 — descriptor describes the method, not the HTTP body.** Shipped
      2026-07-31 (`2a81d11`, `43a82ea`). Methods carrying a usable `input`:
      **4 of 83 → 72 of 83** (the 11 gaps are first-party plugin service methods,
      which now _can_ declare one). Manifest `version` 1 → 2, since `input`
      changed meaning under an unchanged name. Includes stable unique ids
      (`entries.forms/form.get`), `ManifestMethod` exported as a discriminated
      union with all five hand-copied slices deleted, and the parity test — which
      was verified to bite by deliberately breaking an adapter. The MCP
      `users.update` drift is fixed at the wire level: the live server now
      advertises `data.fields`.

        Two defects found and fixed in passing: schemas were emitted in Zod's
        `io: 'output'` mode (the wrong side for a call-input schema — `publishAt`
        rendered as an empty `{}`), and a method with no declared `input` was given
        a synthesised one, which is the mechanism the original drift used.

        Left for later: `types/api.ts` is not the source of truth for three methods
        — `UsersApi.create`/`update` omit `roleSlug` and `MediaApi.update` omits
        `title`, though the services and Zod schemas all accept them. The manifest
        composes from the schemas, so it is correct; the type declarations need
        reconciling on their own.

- [ ] **P1 — one generic dispatcher** replacing the per-domain adapters. Threads
      the plugin handlers that `transport/mcp/index.ts` currently loads and then
      discards. Closes three `backlog.md` items as a side effect.
- [ ] **P2 — request-scoped context + a real permission wrapper.**
      `context/index.ts` holds the request user in a mutable module-level
      variable; move to `AsyncLocalStorage`. Add `scopedService(principal)` so a
      caller cannot exceed its principal by construction, and annotate the
      manifest per-principal.
- [ ] **P3 — confirm gate.** Stateless, on MCP's MRTR shape, with elicitation's
      three actions (`accept`/`decline`/`cancel`). Keyed off `mutates`/`destructive`.
- [ ] **P4 — wire-safe read-shape contract.** The existing write-back guard is a
      non-enumerable `Symbol` brand, so it cannot survive JSON and cannot protect
      the agent path. Carry the shape in the payload for wire crossings.

## Then

- [ ] **P5 — content operations** (`translate`/`transform`/`generate`).
      Server-side and schema-aware, so entry field data never round-trips through
      the model's context as a payload it has to reconstruct.
- [ ] **P6 — context bus** — ambient-context contributors; routes publish a typed
      reference for deixis ("this page"). Must live in a `role: 'system'` message,
      not the system prompt, or every navigation invalidates the prompt cache.
- [ ] **P7 — authoring plugin** — Claude adapter + tool-loop over the manifest +
      chat drawer.

## Decisions worth not re-deriving

- **MCP: borrow the shape, don't chase the wire format.** The spec was revised
  2026-07-28 (stateless core, MRTR, several deprecations) but the SDK tops out at
  the previous revision and real clients track the SDK. Adopt MRTR's _shape_ for
  our gate; leave the transport where the SDK is.
- **The tool-loop does not hold alone.** `specs/ai-integration.md` §3.13 is
  overturned: a tool-loop keeps the long tail, and content operations own
  anything writing entry field data. The split is what makes rich-text editing
  safe, and it lines the two gate mechanisms up with the two operation classes
  (form mode for flat confirms, URL mode → staged entry for content review).
