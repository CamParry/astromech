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
      projects manifest methods as MCP tools over stdio. Shipped with core + 7
      entry actions; P1 closed the plugin-method and entries-long-tail gaps, and
      media upload stays out by declaration (`binaryInput`).

## Foundation — a 2026-07-30 audit found four substrate defects

Fix before building on top. All four are refactors that _delete_ code and shrink
the rest; nothing is deployed, so this is the cheapest moment. Full detail with
file references in the spec.

**P0a, P0, P1, P2 and P3 landed.** The audit's counts were stale: the manifest
was 83 methods at P0, not 71, and is 145 after P1. **P4 is parked** behind the
across-the-board field-validation work — most of it turns out to be ordinary
input validation, so the sequence continues at P5.

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
    - Two defects found and fixed in passing: schemas were emitted in Zod's
      `io: 'output'` mode (the wrong side for a call-input schema — `publishAt`
      rendered as an empty `{}`), and a method with no declared `input` was given
      a synthesised one, which is the mechanism the original drift used.
    - Left for later: `types/api.ts` is not the source of truth for three methods
      — `UsersApi.create`/`update` omit `roleSlug` and `MediaApi.update` omits
      `title`, though the services and Zod schemas all accept them. The manifest
      composes from the schemas, so it is correct; the type declarations need
      reconciling on their own.
- [x] **P1 — one generic dispatcher** replacing the per-domain adapters. Shipped
      2026-08-01 (`4f487a0`). Tool name, description, schema and annotations are
      all projections of manifest fields; `invoke` resolves the service method by
      key at call time. It fits in one line only because P0a normalised every
      method to a single parameter object. Demo surface: **83 → 145 manifest
      methods, 58 → 144 MCP tools, 25 → 1 skips** — and that one skip is
      `media.upload`, which declares `binaryInput` rather than the transport
      keeping a list of exceptions. Verified against a live `astromech mcp` stdio
      session, not only unit tests: 144 tools listed, and
      `plugins_demoRating_describe` called over the wire.
    - Closed with it: plugin methods dispatch (`runMcpServer` registers the plugin
      runtime — local client → `wireEntryAccess` → `registerPlugins`, the order
      `kernel/boot.ts` uses; `bootPlugins` deliberately NOT called), and the
      entries long tail (duplicate/trash/restore/emptyTrash/versions/
      restoreVersion/unpublish/schedule/incomingRelations gained descriptors, and
      the staged-entry/preview methods that had descriptors but no adapter lit
      up).
    - One defect fixed in passing: `publish` was gated on the `versioning`
      capability while `operations/status.ts` asserts `statuses`, so the manifest
      hid publish/unpublish/schedule from every unversioned type — nine of eleven
      in the demo — while the service accepted the call. `requires` is now the
      full `Capability` union, gated on what the service actually asserts.
      `issuePreviewToken` also gained the `expiresAt` coercion `schedule` already
      had for `publishAt`; without it a JSON caller writes a string into a date
      column, which became reachable the moment the tool existed.
    - Substrate gap this exposed and closed: P0 gave `PluginServiceMethod` an
      `input` slot no plugin could fill — a plugin package carries no `zod`
      dependency, and a second copy would break `z.toJSONSchema` anyway. Core now
      re-exports `z`, plus `noInput()` for the no-argument case (a tool with no
      object schema cannot be published at all). All 11 first-party plugin methods
      declare an input.
    - **Open, and worth deciding before P7:** 144 tools is a large fixed prompt
      prefix and there is no filtering mechanism. Tracked in `backlog.md`.
- [x] **P2 — request-scoped context + a real permission wrapper.** Shipped
      2026-08-01 (`7d3e7eb`, `99b35ab`). `context/index.ts` holds the request
      identity in an `AsyncLocalStorage` store on `globalThis`; `setCurrentUser`
      is deleted rather than deprecated, because a setter is the defect. Outside
      `runWithContext` there is no identity and `getCurrentUser()` is null —
      previously a cron tick in a warm process saw whoever last hit the server.
      `scopedService(principal)` wraps every domain against its descriptor and
      fails CLOSED. The audit's chunk-duplication worry does NOT bite: the two
      copies of `currentUser` were the library build and the CLI build, one copy
      each, in separate processes. Don't re-derive it as a bug.
    - Defect found and fixed in passing: the Astro middleware was fabricating
      its half of the identity — hardcoded `roleSlug: 'admin'`, `fields: null` —
      while Hono's `requireAuth` resolved the real row into `c.var`, so the
      service layer and the route layer disagreed about who was calling and each
      authenticated request resolved the session twice. Resolution moved to
      `users/session.ts` and both layers share it; `requireAuth` reuses an
      established context and establishes one itself when nothing has, so the
      Hono app stays mountable standalone. `AuthVariables` and the
      `c.var.user`/`c.var.role` contract are untouched — no route changed.
    - Bypass found in the new wrapper and closed before it shipped:
      `entry:read:full` was enforced ONLY in the HTTP entries routes, which is
      the layer the handle replaces for callers that get no route. Left there,
      `{ full: true }` walks the admin projection past anyone holding a bare
      read. Enforced in `scopeEntries` for every method, not only the ones whose
      signature declares `full` today.
    - Two more the wrapper had to get right, each with a test: `entries.query`
      takes a LIST of types, so a call must hold the permission for every type it
      names (a list is not a way to pair a type you hold with one you don't); and
      `resolveRole` falls back to ADMIN on an unknown slug, so
      `methods --role typo` would have answered "you may call everything" — the
      CLI checks membership itself now.
    - Gap this surfaced rather than hid: `mediaApi.replace` has no descriptor, so
      it is absent from the manifest and invisible to the CLI, MCP and the AI
      surface. The fail-closed handle refuses it even for `*`, and a test records
      that. Giving it one means deciding its permission and input schema —
      tracked in `backlog.md`, not fixed in passing.
    - **`scopedService` has no production consumer yet.** It is the seam P3's
      confirm gate and any remote transport land on. The HTTP routes deliberately
      keep `allows`/`allowsMethod`, because several carry logic a descriptor
      cannot state (`users.get` allowing self-access, the last-admin guard).
    - Manifest byte-parity verified across the `ENTRY_METHOD_ACTIONS` refactor by
      building the preceding commit in-tree and diffing — 185,508 bytes,
      identical. The artefact in a stale checkout is NOT a valid baseline; it was
      pre-P1 and made the first comparison meaningless.
- [x] **P3 — reduction, then the confirm gate.** Shipped 2026-08-02 (`617ef01`,
      `aaf4942`). Reframed first, after researching how vendors with sensitive
      data actually handle this. A stateless gate cannot tell a human's approval
      from a caller fabricating one, so it is a runaway-loop brake, not a
      boundary — and the axis is not stateless vs stateful but which channel the
      approval arrives on, which the access point decides.
    - **Layer 1, highest value: a reduced tool surface.** `--read-only`,
      `--include`, `--exclude` in `policies/tool-surface.ts`, applied by both
      `methods` and `mcp`. `readOnly` overrides an explicit include (GitHub's
      semantics, copied deliberately including the part that looks like a bug).
      The reduction is STRUCTURAL where `readOnlyHint` is advisory: an excluded
      method gets no dispatch entry at all. Verified over live stdio, not only
      in unit tests — `entries_post_publish` reaches the service on the full
      surface and returns `Unknown tool` under `--read-only`. Demo: 145 methods
      / 100 mutating → 45 / **0**; `--read-only --include users.create` → 0.
    - **Layer 2: the stateless MRTR gate** (`policies/confirm-gate.ts`), pure and
      dispatch-level, keeping no state anywhere. Trigger is a predicate with
      `mutating`/`destructive` presets. **Off by default** — an MCP client
      already prompts before running a tool, so gating by default double-prompts
      for no added safety; `--confirm` is for callers that aren't a prompting
      client, chiefly P7's tool-loop. Live stdio: no `_confirm` →
      `input_required`, `decline` → `declined`, `cancel` → `cancelled`, garbage
      → `input_required` (fails closed), `accept` → reaches the service.
    - Two things the gate had to get right. The manifest emits
      `additionalProperties: false`, so a gated tool must **advertise `_confirm`
      in its published schema** or it publishes one forbidding the only argument
      that can unblock it. And the invoke is wrapped even when the gate is OFF,
      purely so `_confirm` is always stripped — a stray one must never reach a
      Zod schema that rejects unknown keys, or a method with a loose `fields`
      record that would store it.
    - **Layer 3: no new mechanism.** Staged entries + preview tokens already ARE
      MCP's URL mode — stage server-side, human opens the preview in admin, merge
      runs as an authenticated admin action. Content ops route through it at P5;
      the admin chat drawer gets its human from the session, not the protocol.
    - A signed nonce was considered and REJECTED: it proves a round-trip
      happened, not that anyone saw it, while carrying the state cost of the
      thing that would.
    - Bug found and fixed in passing: **preview tokens never expired.** `isValid`
      treats a null `expiresAt` as "forever" and the operation passed null
      whenever the caller said nothing, so every token ever issued was still
      valid. Defaults to 7 days now; an explicit `null` still means forever, but
      has to be asked for rather than being what everyone silently got.
- [ ] **P4 — wire-safe read-shape contract. PARKED 2026-08-02**, pending the
      across-the-board field-validation work, then re-scope against whatever gaps
      remain. Design settled and the substrate surveyed; nothing built.
    - **The guard has never worked anywhere**, which is a bigger finding than the
      audit's "it cannot cross the wire". `markPublic` brands the **Entry**;
      `create`/`update` check `isPublicBranded(params.fields)` — a different
      object, since `applyVisibility` returns `{...entry, fields: cleanFields}`.
      So `update({data: {fields: entry.fields}})` sails through in-process. The
      existing tests brand a bare object and pass it directly, exercising the
      helper and never the path.
    - **The damage is real.** `fields` is a whole-blob column replacement —
      `updateOne` forwards it to `storage.update` with no merge against
      `currentEntry.fields`. A public-shape write-back permanently drops every
      `private: true` field and every `_disabled` item.
    - **Separate stored-content gap, independent of the shape question:** the
      rich-text `allow` list is enforced only at RENDER (`renderRichText`
      sanitizes on the way out). `richtext` is `{name, type, ...options}` with no
      validator, so any node type can be stored and a `full` read returns it raw.
    - **Research conclusion — no one solves this with a payload marker.** Two
      structural levers converge instead. (1) _The write shape differs from the
      read shape_: WordPress returns `content.rendered` in `context=view` and
      makes only `content.raw` writable, so writing back a view response is a
      type error, not silent corruption; GraphQL separates input from output
      types; Contentful splits CDA and CMA into different products. (2) _Writes
      merge by declared intent rather than replace_: Kubernetes hit this exact
      bug — client-side apply deleted fields the client never knew about — and
      fixed it with Server-Side Apply + `managedFields`, not with markers.
      `FieldMask` and JSON:API PATCH are the same lever. Astromech has neither.
    - **Direction agreed:** validation on the way in carries the load; an
      entry-level `_shape` key is a diagnostic only and must not do the
      enforcing. Rich text should accept only a valid ProseMirror document for
      its `allow` list and reject a string outright.
    - **Trap for whoever builds it:** `Node.fromJSON` does NOT validate nested
      content rules — it deserializes unsupported content happily. Validation is
      `Node.fromJSON(schema, doc)` followed by `.check()`. `@tiptap/pm` and
      `getSchema` are already dependencies; no new packages needed.
    - **Open question, deliberately not decided:** whether `update` keeps
      replacing the whole `fields` blob. Validation cannot catch a public read
      that dropped a `private: true` **text** field — same type, same shape as a
      deliberate clear — so a write-back still deletes it silently. Merge-by-
      intent is the only thing that closes it, and it changes what "set `fields`"
      means everywhere: clearing a field would need an explicit null rather than
      an omission.

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
