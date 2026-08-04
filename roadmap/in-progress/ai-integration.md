# AI integration

Builds on the services/transport seam. Method manifest (the discovery linchpin)
shipped first — see `completed/method-manifest.md`; CLI/MCP/confirmation/authoring
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

**The foundation is complete — P0a, P0, P1, P2, P3 and both halves of P4 have
landed.** The audit's counts were stale: the manifest was 83 methods at P0, not
71, and is 145 after P1. P4 was unparked when the field-validation work that
blocked it carried its validation half along (`221989a`); the PATCH-only half
followed on 2026-08-03. Next is P5.

- [x] **P0a — normalise every service method to a parameter object.** Shipped
      2026-07-31 (`934f1d0`). `update` takes a nested `data` (`update({id, data})`)
      matching the entries precedent, not a flattened `{id, ...patch}`. The
      manifest was byte-identical before and after, which is what proved the
      commit changed signatures and not semantics. `notificationsService` stays
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
    - Left for later: `types/services.ts` is not the source of truth for three methods
      — `UsersService.create`/`update` omit `roleSlug` and `MediaService.update` omits
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
      `boot/boot.ts` uses; `bootPlugins` deliberately NOT called), and the
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
      2026-08-01 (`7d3e7eb`, `99b35ab`). `request-context/index.ts` holds the request
      identity in an `AsyncLocalStorage` store on `globalThis`; `setCurrentUser`
      is deleted rather than deprecated, because a setter is the defect. Outside
      `runWithContext` there is no identity and `getCurrentUser()` is null —
      previously a cron tick in a warm process saw whoever last hit the server.
      `scopedServices(role)` wraps every domain against its descriptor and
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
    - Gap this surfaced rather than hid: `mediaService.replace` has no descriptor, so
      it is absent from the manifest and invisible to the CLI, MCP and the AI
      surface. The fail-closed handle refuses it even for `*`, and a test records
      that. Giving it one means deciding its permission and input schema —
      tracked in `backlog.md`, not fixed in passing.
    - **`scopedServices` has no production consumer yet.** It is the seam P3's
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
      approval arrives on, which the access point decides. - **Layer 1, highest value: a reduced tool surface.** `--read-only`,
      `--include`, `--exclude` in `policies/method-filter.ts`, applied by both
      `methods` and `mcp`. `readOnly` overrides an explicit include (GitHub's
      semantics, copied deliberately including the part that looks like a bug).
      The reduction is STRUCTURAL where `readOnlyHint` is advisory: an excluded
      method gets no dispatch entry at all. Verified over live stdio, not only
      in unit tests — `entries_post_publish` reaches the service on the full
      surface and returns `Unknown tool` under `--read-only`. Demo: 145 methods
      / 100 mutating → 45 / **0**; `--read-only --include users.create` → 0. - **Layer 2: the stateless MRTR gate** (`policies/confirmation.ts`), pure and
      dispatch-level, keeping no state anywhere. Trigger is a predicate with
      `mutating`/`destructive` presets. **Off by default** — an MCP client
      already prompts before running a tool, so gating by default double-prompts
      for no added safety; `--confirm` is for callers that aren't a prompting
      client, chiefly P7's tool-loop. Live stdio: no `_confirm` →
      `input_required`, `decline` → `declined`, `cancel` → `cancelled`, garbage
      → `input_required` (fails closed), `accept` → reaches the service. - Two things the gate had to get right. The manifest emits
      `additionalProperties: false`, so a gated tool must **advertise `_confirm`
      in its published schema** or it publishes one forbidding the only argument
      that can unblock it. And the invoke is wrapped even when the gate is OFF,
      purely so `_confirm` is always stripped — a stray one must never reach a
      Zod schema that rejects unknown keys, or a method with a loose `fields`
      record that would store it. - **Layer 3: no new mechanism.** Staged entries + preview tokens already ARE
      MCP's URL mode — stage server-side, human opens the preview in admin, merge
      runs as an authenticated admin action. Content ops route through it at P5;
      the admin chat drawer gets its human from the session, not the protocol. - A signed nonce was considered and REJECTED: it proves a round-trip
      happened, not that anyone saw it, while carrying the state cost of the
      thing that would. - Bug found and fixed in passing: **preview tokens never expired.** `isValid`
      treats a null `expiresAt` as "forever" and the operation passed null
      whenever the caller said nothing, so every token ever issued was still
      valid. Defaults to 7 days now; an explicit `null` still means forever, but
      has to be asked for rather than being what everyone silently got.
      **P4 — wire-safe read-shape contract.** Split in two once the field-validation
      work it was parked behind landed and carried half of it along. **Research
      conclusion — no one solves this with a payload marker.** Two structural levers
      converge instead, and P4a/P4b are one each. (1) _The write shape differs from the
      read shape_: WordPress returns `content.rendered` in `context=view` and makes only
      `content.raw` writable, so writing back a view response is a type error, not
      silent corruption; GraphQL separates input from output types; Contentful splits
      CDA and CMA into different products. (2) _Writes merge by declared intent rather
      than replace_: Kubernetes hit this exact bug — client-side apply deleted fields
      the client never knew about — and fixed it with Server-Side Apply +
      `managedFields`, not with markers. `FieldMask` and JSON:API PATCH are the same
      lever.

- [x] **P4a — validation on the way in (lever 1).** Shipped 2026-08-03
      (`221989a`), riding the field-validation work that parked P4 rather than
      waiting behind it. Closes the cases where the public shape is
      _distinguishable_ from the full one.
    - `fields/rich-text/validate.ts` — `validateRichText` is the `richtext`
      descriptor's validator: `Node.fromJSON(schemaFor(allow), value)` **then**
      `.check()`. Both halves are load-bearing; `fromJSON` does NOT validate
      nested content rules on its own. Schemas cache by `allow` list, since
      building one configures the whole StarterKit.
    - A string is rejected outright ("Must be a rich text document, not an HTML
      string") — that is precisely what a public read hands back, so the
      write-back lands as a validation error rather than as corruption.
    - `coerceRichText` maps `''` → `null`. A public read renders an empty
      document to `''`, which the pipeline treats as absent — the one bad value
      validation would never have seen.
    - Fixes the stored-content gap the audit found separately: the `allow` list
      used to be enforced only at RENDER (`renderRichText` sanitizes on the way
      out), so any node type could be stored and a `full` read returned it raw.
    - Lever 1 also exists at the type level: the generator emits `string` for a
      public-shape richtext field and `JsonValue` for the full one, plus a
      `readonly __shape?: 'public'` brand, so writing a public read-back into a
      `full` write is a compile error.
    - The `_shape` key stays a diagnostic and must not do the enforcing — that
      was the direction, and it held.
- [x] **P4b — `update` becomes PATCH-only (lever 2).** Shipped 2026-08-03. The
      half that catches the _indistinguishable_ cases: a dropped `private: true`
      **text** field is simply absent from a patch, so it survives. P4a and P4b
      were always a pair — P4a alone leaves the class open. - The API already claimed patch semantics and failed to honour them one level
      down: top-level columns treat `undefined` as "leave alone", but `fields` is
      a single JSON column, so `update({data: {fields: {a: 1}}})` deleted every
      other field while `update({data: {title: 'x'}})` left them be. That
      inconsistency was the real trap; the public/full shape mismatch is just the
      case that makes it visible. It also fixes the precondition — PUT requires
      the caller to know the complete current state, which is unreasonable for
      any caller and impossible for one holding a projection. - The four semantics, settled and built: 1. **Patch at the root field level and the root table level only.** No
      deeply nested patching — it gets complex fast and becomes a pain when
      you genuinely do want to remove something. 2. **Arrays are atomic values**, replaced wholesale (repeaters, blocks,
      trees). Index-wise merging is ambiguous; RFC 7396 replaces arrays for
      the same reason. Editing one item in ten still means sending ten —
      which is where P5's content operations should own the edit anyway. 3. **`null` is a legitimate stored value, not a delete.** The schema is
      predefined, so the key set is fixed and dropping a key is the wrong
      idea. Absent means "leave alone"; explicit `null` means "store null",
      allowed as long as the field is not required. NOT RFC 7396 semantics,
      deliberately. 4. **Validation runs against the merged result**, or a small patch fails
      completeness checks it should never have been subject to. Refined to
      **coerce the patch, validate the merged**: coercion is not guaranteed
      idempotent, so re-running it over untouched values would rewrite data
      the caller never mentioned. `processFields` gained `coerceOnly` — the
      root names a patch carries; coercion runs for those and their subtrees
      only, while defaults, `children()` normalization and validation still
      see the whole merged document. - **The same defect was in `users.update` and `media.update`**, both live MCP
      tools, and both are fixed the same way. `settings.set`, `staging/merge`,
      `restoreVersion` and `create` stay whole-document writes by design. - Orphaned keys: `processFields` does NOT drop unknown keys (`result =
{...values}`), so the projection is an explicit step, not free. The merged
      result is projected through the schema before the write. An empty
      definition list means the schema is UNKNOWN here, not empty, and projects
      nothing — without that guard a type whose config failed to resolve would
      have its data wiped. - `mergePatch` clones its base. The pipeline mutates nested scope objects in
      place, so without the clone it rewrites the freshly-loaded current record —
      which the versioning change-detection then compares against, and a real
      change reads as "unchanged" and skips its backup version. - Translatable propagation now keys off the PATCHED names, not the merged
      document's keys; the merged document holds every field, so propagating from
      it would overwrite sibling locales with values nobody touched. - **No built-in coercer turned out to be non-idempotent** (`slug`, `email`,
      `url`, `key-value`, `number`, `date`, `richtext` all satisfy `f(f(x)) ===
f(x)`), so re-coercion is only observable when the STORED value is not
      already in coerced form — schema drift. `coerceOnly` is still the right
      mechanism; it just means the guarantee is cheap today rather than urgent.
      Both cases are tested: a probe field type in the pipeline unit test, and a
      `text` → `slug` drift in the entries integration test. - **The runtime guard has never worked anywhere** (re-verified 2026-08-03),
      which is a bigger finding than the audit's "it cannot cross the wire".
      `markPublic` brands the **Entry** (`operations/get.ts`); `create`/`update`
      check `isPublicBranded(params.data.fields)` — a different object. The merge
      makes it vestigial and it was left exactly as it is: the regression test
      round-trips a public read through `JSON.parse(JSON.stringify(...))` and the
      private field survives because of the MERGE, not the brand. - Nothing cleared fields by omission: the admin form submits every field, so
      merge is a superset there. Answered before building, as required. - Left open: **`create` does not project to the schema** — an orphan key sent
      to `create` is stored verbatim, and only `update` drops them. Worth
      deciding on its own.

## Then

- [x] **P5 — content operations** (`translate`/`transform`/`generate`). Shipped
      2026-08-03. Server-side and schema-aware, so entry field data never
      round-trips through the model's context as a payload it has to reconstruct
      — the operation owns the read, the placement and the write. Five commits:
      the provider seam, the rich-text leaves, the operations, the transport
      wiring, the permission handle.
    - **`translate` never serializes the document.** `@tiptap/core`'s
      `generateJSON` needs a DOM and throws server-side, so HTML-in was never
      available and a shim would have been a dependency bought to parse model
      output. Instead the operation walks the stored tree, sends each BLOCK's
      inline content as Markdown, and puts the reply back in the same block.
      Structure is preserved by construction: the model never sees it, so it
      cannot merge two paragraphs or invent a heading level. `transform` and
      `generate` do restructure, so they get block-level Markdown, both
      directions clamped by the field's `allow` list.
    - Three findings from the converters, none obvious. **`code` excludes every
      other mark in the schema** — `Node.check()` rejects `marks: [bold, code]`,
      so a naive converter emits documents P4a rejects. **Empty things are
      invalid**: an empty text node, doc or blockquote all fail `check()`, and a
      `listItem` must start with a paragraph. And **Markdown carries only a
      link's href**, so writing parsed nodes back verbatim silently drops
      `target`/`rel`/`class` from every link — apply restores the original attrs
      by href, which is what makes an unchanged-text round trip deep-equal on a
      real editor document rather than only on a trimmed fixture.
    - **Eligibility is an allow-list, not a deny-list**, so an unrecognised or
      plugin-registered field type is never sent. Only `text`, `textarea`,
      `richtext`. `slug`/`url`/`email` are text-shaped but they are IDENTIFIERS —
      rewriting a slug breaks every inbound link. Option sets fail their own
      `validateChoice` if rewritten. Containers are descended into via the
      descriptor's `children()`, which is also how `_id` paths are minted, so
      eligibility and the validation pipeline agree on addressing by construction.
      `paths` never widens any of this.
    - **`private: true` is never sent to a model and `paths` cannot override it.**
      A private field is content the CMS already refuses an unauthenticated
      reader; handing it to a third party is a wider disclosure than the author
      declared, with nobody to ask at call time. Excluding is reversible, a leak
      is not. The price: `generate` cannot fill a private field. Private values
      are still COPIED into a translation sibling — a database copy, not a model
      call.
    - `getNonTranslatableFieldNames` could NOT be used as the design assumed: it
      walks `flattenEntryFields`, so it sees top-level names only and a
      `translatable: false` field inside a repeater would have been translated.
      Eligibility checks the flag at every depth and does not descend into a
      non-translatable container at all.
    - **There is no config fallback for the provider and there cannot be one** —
      a provider is a function and `virtual:astromech/config` is
      `JSON.stringify`'d. The registry is the only path, so what it must survive
      is the lifecycle: `config:setup` is build time and does not re-run per
      request in a Worker, which makes idempotent registration the requirement.
      Core ships no provider; the suite makes no network call.
    - All-or-nothing has two halves — every rewrite completes before any write,
      and the pipeline runs over the merged document before it (the `mergeStaged`
      ordering). `createStaged` → `update` is wrapped so a rejected update deletes
      the staged row, which would otherwise block the next attempt with
      `StagedEntryExistsError`.
    - `content` joins the DAG as a **downstream domain**, not a peer: it may
      import `entries/`, and the enforced rule is the reverse one. The plugin
      entry-access port cannot serve it — that port is deliberately service-free
      (`qualifyEntryType` plus storage setters, no reads or writes).
    - **Double permission gate**: holding `content:translate` must not let a
      caller rewrite a type they cannot update, so both the HTTP route and
      `scopeContent` check the descriptor permission AND the target type's
      `update`, derived through `entryPermission` so a plugin type gets the
      plugin form free. `editor` holds all three content keys — it already holds
      `entry:*`, so they widen its reach by zero types and only decide whether it
      may reach them via a model.
    - An out-of-allow model reply is **clamped, not rejected** — the converters
      take `allow` by construction, so the validator never sees it. The original
      acceptance criterion ("fails validation on the staged entry") was
      unreachable; the property is covered from both sides instead.
    - Open, and inherited rather than introduced: `scopedServices` still has **no
      non-test consumer for any domain**, so MCP applies no permission check to
      anything today. Content is now complete in the handle, so it is covered the
      moment that seam is used. Wiring it into a transport is a system-wide
      change. Also open: the typed local client carries `content` as an
      intersection rather than on `AstromechClient` (which the fetch Client also
      implements), so the browser admin reaches these operations over HTTP, not
      through the typed client — the decision to revisit when P7's drawer lands.
- [x] **P6 — AI context** — admin routes declare a typed `AIContextReference`
      (`{ kind, type?, id?, label }`) for what the user is looking at, so a model
      can resolve deixis ("this page", "this field"). Assembled into a
      `role: 'system'` message inside `messages[]`, **not** the system prompt, or
      every navigation invalidates the prompt cache — the same reasoning that
      already fixes the manifest's sort order in `codegen/method-manifest.ts`.
      Contributions are an ordered list, not a flat set: a layout, its route and
      a focused field editor can contribute at once, and order decides what
      "this" refers to.
    - Renamed from **context bus** on 2026-08-03, before any code was written.
      "Bus" means _event bus_ to a web developer — `emit`/`subscribe`,
      many-to-many, subscribers reacting — and this has one consumer, no events,
      and is pulled at send time. `publish` went with it (same pub/sub family;
      a route states what it is about, it does not broadcast). "Ambient" names a
      quality rather than the thing; "UI context" collides with React's
      `useContext` and points the wrong way; "awareness" is a state, not a value;
      "insight" is model output, not model input. Full rationale and the general
      naming rule it produced: `decisions/0005-ai-context-naming.md`.
    - The `AI` prefix is load-bearing, not decoration: `src/request-context/` is already
      the server-side `AsyncLocalStorage` request context, and it is on admin's
      forbidden-import list in `.dependency-cruiser.cjs`.
    - **Built 2026-08-03** on `feat/ai-context`, four commits, 2299/158 → 2330/161.
      `types/ai-context.ts` (reference) and `utilities/ai-context.ts`
      (`formatAIContextMessage`) sit in pure leaves so P7's server-side loop can
      import them — everything below admin is forbidden from importing
      `^src/admin/`. `admin/context/ai-context.tsx` holds the store,
      `AIContextProvider` (mounted on the `_protected` layout, which does not
      remount on navigation) and `useAIContext` / `useAIContextEntries`. Ten
      screens declare: lists at depth 0, single items at depth 1.
    - **`defineRegistry` was rejected** for the store: single-value,
      non-reactive, globalThis-backed for a server chunking problem the SPA does
      not have, and it has no use anywhere under `admin/`. The admin's own
      precedent is `admin/definitions/field-registry.ts` — module-level state,
      no globalThis — plus `useSyncExternalStore`.
    - **Three invariants that are silent bugs if broken.** `order` is assigned
      once per key, so re-registering cannot reshuffle a route against its
      siblings. `getSnapshot` returns a cached array reference, or
      `useSyncExternalStore` re-renders forever. The store does not sort —
      sorting by depth then order belongs to `formatAIContextMessage` alone,
      and duplicating it would give one fact two sources of truth.
    - **Depth is explicit, not insertion order.** React runs effects child-first,
      so a focused field editor registers _before_ its own route and insertion
      order silently inverts.
    - `kind` is `entries | media | users | settings | pages`, taken verbatim from
      the method manifest's catalogue list rather than coined. Plural throughout
      even though a reference usually names one item: the alternative is a second
      singular vocabulary for domains already named in the plural everywhere else.
    - The **dev-only readout** (`admin/components/dev/`, gated on
      `import.meta.env.DEV`) renders `formatAIContextMessage`'s own output rather
      than its own view of the entries, so the assembly path stays exercised
      until P7 consumes it for real. Its CSS is co-located, not in
      `styles/main.css` — `main.tsx` imports that unconditionally, so a partial
      there would ship dev-only rules into production despite the gate.
    - Open, and logged in `roadmap/backlog.md`: creation (`new.tsx`) and version
      -history routes declare nothing, and modal-driven detail views (media
      library) still report only the list. All three need a new `kind` or an
      extra wording branch in the formatter first — declaring them today would
      describe a creation screen as an entry list.
- [ ] **P7 — authoring plugin** — Claude adapter + tool-loop over the manifest +
      chat drawer. **Built and merged 2026-08-03**; unticked because the
      assistant is read-only and no model round-trip has ever run.
    - **The drawer 500s on every send — found and FIXED 2026-08-04.**
      `POST /api/plugins/authoring/chat` died on
      `ERR_UNSUPPORTED_ESM_URL_SCHEME … 'virtual:'`. Astro loads a site's config
      — and so every plugin factory and the `rawRoutes` closures hanging off it
      — in plain Node, so the handler's imports resolved through Node's loader,
      where `astromech/methods` → `scopedServices` → the domain services →
      `virtual:astromech/config` cannot resolve. Core escapes this only because
      its runtime is Vite-compiled from `src`. `ctx` has always been the bridge
      and nothing wrote that down, which is how this package walked past it.
        - **`ctx.methods.tools({ readOnly })`** returns the manifest methods the
          acting role may call, already resolved through `scopedServices`. Core
          owns the whole composition, because three of its four steps look
          optional and are not, and their order is load-bearing.
          `decisions/0007` holds the mechanism and the rejected alternatives
          (`ssr.noExternal` was tried and is inert; Node loader hooks would
          resolve to a _second_ config module; VS Code's inject-at-require needs
          a host that loads the plugin, and Astro's config loads ours before
          core exists). `decisions/0008` holds the port's shape and name.
        - Three constraints shaped it, none optional: the implementation must be
          a Vite-graph closure, so it is wired at module top level in
          `transport/local` and NOT in `initRuntime` (which runs in plain Node
          inside `config:setup`); `plugins/runtime` may not import `policies`,
          `transport` or `codegen`, so it holds an injected implementation; and
          `types/` may import only leaves, so `ToolDispatch` moved down into
          `types/services.ts`.
        - `formatAIContextMessage` joined the main barrel. It is pure and was
          unreachable only because it shared a barrel with `scopedServices` —
          `apps/docs/ai-context.md` was telling readers to import it from the
          subpath that throws.
        - **`npm run check:node-imports`** is the regression guard: a unit test
          cannot catch this class, because vitest aliases core to `src` and
          shims `virtual:`, so the failing import passes there. It spawns plain
          `node` against `dist` and imports each server-side subpath a plugin or
          an Astro config may load.
        - **Browser-verified 2026-08-04** against the demo on 4323 with a
          deliberately invalid `ANTHROPIC_API_KEY` (nothing billed): the log
          reads `Chat request running against 38 tools`, the route returns
          `[200]`, and the transcript shows the API's own
          `401 authentication_error`. The dispatch table is built and the
          round-trip reaches Anthropic; only the key is fake.
        - Deferred with its own file: `PluginRawRoute.handler` is a closure
          where Astro's `injectRoute` takes an `entrypoint`, which is the reason
          plugin route code is outside Vite's graph at all. Changing the
          contract would remove the need for a port on routes, but cannot help
          hooks, service methods or cron. See
          `roadmap/planned/plugin-route-entrypoints.md`.
        - Behaviour change worth knowing: the dispatches are built in the route
          rather than inside the loop's `try`, so a missing manifest is a 500
          rather than an error event in the transcript. Both are boot wiring
          bugs, not reachable user states.
    - `@astromech/authoring` ships the package, a streaming chat route, the
      model loop and the drawer. Browser-verified against the demo: the drawer
      opens, the transcript is a live region, focus returns to its toggle on
      Escape, and the entries-list route's declared AI context arrives in the
      request body. **Not verified:** an actual call to the API — that needs a
      real key. Nor the scroll-disengage path, IME composition, the
      Firefox/Safari textarea fallback, dark mode or a narrow viewport.
    - **`readOnly: true` by default**, so the surface is non-mutating methods
      only. Writes wait for a confirm UI in the drawer; there is nowhere to
      approve one from today.
    - `buildScopedDispatch(manifest, role)` was the missing seam.
      `buildDispatch` resolves the RAW services — deliberate, and stated in its
      docblock, because the MCP transport is dev-only and trusted. A loop acting
      for a signed-in user is not, so it gets a sibling that resolves through
      `scopedServices`. A separate function rather than an option: an options bag
      would make an omitted key and an explicit `undefined` mean trusted and
      allowed-nothing, which is the one distinction a caller must not get wrong.
    - **Plugin-source methods are refused when scoped.** They dispatch through a
      path that builds a `PluginContext` without enforcing the method's declared
      `access` — the HTTP RPC route does that separately — so there is nothing
      to scope them with. The loop drops them before dispatch.
    - The `annotateManifest` filter in the loop is a **size** reduction, not a
      check. `allowed` is advisory; `buildScopedDispatch` is what refuses.
      `allowed === null` is kept — an input-derived permission only the scoped
      handle can decide.
    - **The route imports the loop at request time, not module load.** A site's
      config is loaded in plain Node at Astro config time, and the loop's value
      import of `astromech/methods` reaches domain services that read
      `virtual:astromech/config`. Registering the plugin broke the demo
      instantly. `npm run check:config` now loads the demo config the way Astro
      does, so the trap is caught before a plugin is wired up rather than after.
    - AI context rides in a `role: 'system'` message immediately before the
      final user turn, keeping it after the last cache breakpoint. On the
      opening turn there is no earlier turn to follow and a system message may
      not be `messages[0]`, so it goes in the system prompt instead — free,
      since no prefix is cached yet. That case shipped broken and was caught by
      reading; it is now the package's regression test.
    - **Declared values are sanitized** before they reach the system message:
      control characters stripped, backticks neutralised so a value cannot close
      its own code span, length clamped, and a closing line stating the quoted
      values are data rather than instructions. This closes the gap P6 left.
    - `@astromech/authoring` is the **first plugin package here with tests** —
      21→27 across the request assembler, the tool surface and SSE framing. They
      mock `astromech/methods` rather than importing it, so they cover this
      package's glue and not core's seams, and need no built core dist.
    - The drawer is the **slot system's first consumer**. Hand-written
      throughout — the admin has no Radix and no animation library. Borrowed
      from shadcn/`ai-elements` as behaviour, not code: the scroll pin held on a
      ref (in state it re-renders the transcript on every
      scroll tick), `aria-relevant="additions"` so a screen reader stops
      re-announcing a garbled partial word per chunk, and the
      `nativeEvent.isComposing` guard against Enter sending half a word of IME
      input.
    - **Markdown merged 2026-08-04** (`bc833ff`). Assistant text renders through
      `react-markdown` + `remark-gfm`; user text stays literal. Raw HTML is not
      rendered and `javascript:` URLs are blocked, both by react-markdown's
      defaults — no `rehype-raw`. Styling mirrors `.am-richtext-content` rather
      than reusing the class, which carries editor-only `min-height` and focus
      rules. Core's own markdown path was rejected: it targets the ProseMirror
      schema and lives behind the server barrel.
    - **AI context placement fixed 2026-08-04** (`d2e2b3b`). The context message
      was spliced _before_ the final user turn, so it landed after an assistant
      turn and the API rejected the request — `role: 'system'` must follow a user
      turn and be last or followed by an assistant turn. It is appended after the
      final user turn now, which also keeps it past the last cache breakpoint.
    - **Still open:** no i18n, no component tests, and the API base is `/api`
      hardcoded — `apiRoute` lives only on a virtual
      module no hook re-exports, so a site that moves it breaks the drawer. And
      the tool count is unaddressed: selection degrades past 30–50, permission
      reduction bottoms out near 45, so `defer_loading` plus tool search is
      still required.
    - **Foundation merged 2026-08-03** (`2b947da`, `610d131`), 2330/161 → 2340/164.
      `@astromech/authoring` was unwritable before it: the manifest generator,
      `buildDispatch`, `filterMethods`, `annotateManifest`, `scopedServices` and
      the confirm gate were all internal, and `PluginContext` carried no `Role`
      for `scopedServices` to take. All now reachable on a new `astromech/methods`
      subpath, with `role` on the context.
    - The manifest is generated **once in `initRuntime`** into a registry, not
      read from `.astro/astromech.methods.json`: generating it needs the raw
      `PluginDefinition[]`, whose Zod `input` schemas cannot survive JSON — the
      same reason MCP regenerates in-process. Both sites call the one pure
      function, so the file and the registry cannot drift.
    - `request-context/request-context.ts` exists because sourcing `role` from
      `request-context/index.ts` would pull `virtual:astromech/config` into the Astro
      integration's config-load graph, which runs in plain Node where `virtual:`
      cannot resolve — `astro dev` would fail at integration load.
    - `formatAIContextMessage` now ships on `astromech/methods`. P6 put it in a
      pure leaf so a server-side loop could import it; it was on no published
      subpath, so that rationale was untrue as shipped.
    - `useAIContextEntries` reaches `astromech/ui`. The vitest shim for
      `virtual:astromech/plugins/components` never exported `slots`, so any test
      rendering `PluginSlot` crashed on `slots[name]`; fixed, and `PluginSlot`
      has its first coverage. Also fixed: `virtual-modules.d.ts` imported types
      from a path resolving outside the package, hidden by `skipLibCheck`.
    - **Decided from the SDK docs, not recall** (`@anthropic-ai/sdk@0.115.0`):
      `role: 'system'` inside `messages[]` is GA and correct for AI context —
      but only on Opus 5 / 4.8 / Fable 5 / Mythos 5, and it silently falls back
      to top-level `system` on Sonnet 5, so the model option cannot be a free
      string. Tool selection degrades past **30–50** tools and we publish 147, so
      the loop needs `defer_loading` + the tool-search tool, not just permission
      reduction (~45). The approval gate belongs in the **loop body** —
      `toolRunner` yields the assistant message before executing tools and
      `pushMessages()` marks state user-managed so they never run — not in the
      tool handler. `betaTool` does **no** runtime validation despite its own
      doc comment; validate inside `run`. A streaming iteration aborts its
      stream when the body returns, so `await stream.finalMessage()` is
      mandatory every turn.
    - **Open, and a real gap:** `formatAIContextMessage` interpolates `label`,
      which for an entry is its author-controlled title, into a system-role
      message — the docs are explicit that system content carries operator
      authority and must not hold text from outside the conversation. It needs
      sanitizing (strip newlines and control characters, clamp length, phrase as
      fact) before the loop sends one. Same trust boundary as the write-back
      guard.

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
