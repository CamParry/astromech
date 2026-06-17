# AI Integration — services layer, method manifest, agentic authoring & context-aware chat

**Status:** Designed (discussion 2026-06-16); not yet implemented. Concepts locked; several decisions deferred to iteration (see §6). Spawns multiple workstreams (§7).
**Touches:** `src/sdk/{local,fetch}`, `src/schemas/*`, `src/core/permissions.ts`, `src/core/plugin-runtime.ts`, `src/types/plugins.ts`, `src/index.ts` (`defineSdkMethod`), `src/adapters/astro.ts` (virtual modules / build hooks), `src/cli/*`, `src/api/routes/*`, `src/admin/*` (chat UI, context bus, chrome-injection slots), new `src/core/method-generator.ts`, new MCP server package.
**Related:** [[services-architecture.md]] (canonical layer vocabulary — _this doc defers to it_), [[plugin-architecture.md]], [[unified-architecture.md]], [[content-visibility.md]]. Memories: `project_content_visibility.md`, `reserved_instance_keys.md`.

---

## 1. Background & Motivation

"Good AI integration" for a modern CMS splits into two products that share one substrate:

1. **Developer / agentic-coding side** — an IDE agent (Claude Code etc.) editing content during development. Delivered as **good docs + a small MCP server** over the existing capability, plus a real CLI. This is **dev-scaffolding, never production-exposed**, so it can be powerful by default.
2. **Authoring side** — a runtime, in-admin AI assistant (floating chat / right drawer) that translates, generates pages from blocks, and edits content on the user's behalf, **scoped to the requesting user's permissions**, with a **programmatic confirm gate** so mistakes can't run away.

The key realisation from design discussion: **almost all the substrate already exists**, and both sides are largely _assembly_ of existing parts rather than new infrastructure. The two AI sides even map onto the existing two-SDK split (trusted `local` vs permission-enforcing HTTP). The work is (a) naming and lightly refactoring the capability into a self-describing **services** layer, (b) emitting a build-time **method manifest** so an AI knows what exists, and (c) building the admin chat + a UI-injection point to host it.

### Current-state facts (verified 2026-06-16)

- **Two SDKs already encode the dev/runtime split.** `astromech/local` (`src/sdk/local/*`) talks to the DB directly and **bypasses permission checks by design** (`src/core/permissions.ts:2-4`); `astromech/fetch` (`src/sdk/fetch/*`) is an HTTP **client of the API**. Permissions are enforced **only at the Hono layer** (`src/api/routes/*`, `can(role, permission)`).
- **RBAC exists and is fine-grained.** Grammar `resource:identifier:action` with wildcards (`src/types/domain.ts`); built-in `admin` (`*`) and `editor` (`src/core/permissions.ts:39-42`); **`publish` is already a separate permission from `update`** (`src/api/routes/entries.ts:491-494`); `users:*`, `settings:*`, `plugin:<ns>:*` all exist.
- **A CLI exists but is thin and early.** Citty-based (`src/cli/*`): `db:*`, `users:* (list/get/delete)`, `entries:* (list/get/delete)`, `generate:types`. No create/update; emits human text, not JSON. Needs a rebuild to be the real surface.
- **Validation primitive is Zod v4**, already the HTTP toolchain via `@hono/zod-openapi` (`src/schemas/{entries,users,media}.ts`). So **Zod→JSON Schema is already available**. No JSON-Schema/OpenAPI export for _field_ definitions yet.
- **Content shape is `FieldDefinition[]`** (`src/types/fields.ts`) — serializable, walked by the type-generator (`src/core/type-generator.ts`) to emit `.d.ts`. A second walk → JSON Schema gives the page-generation contract.
- **Plugin SDK methods are `{ access, handler }` only** (`PluginSdkMethod`, `src/types/plugins.ts:78-81`) — no input schema, no metadata. Generics are runtime-erased, so schemas must be _declared_. There is a `defineSdkMethod` seam (`src/index.ts:90`) that does not yet take a schema.
- **Build pipeline can emit a manifest trivially.** Virtual modules + type-gen run in `src/adapters/astro.ts`; `astro:config:done` (≈355-366) already calls `generateSdkTypes()` with the fully-resolved plugin set; `getPluginSdkMethods()` (`src/core/plugin-runtime.ts:194`) enumerates plugin methods. Generated artifacts land in `.astro/`.
- **Admin UI does pages/fields/settings, but NOT persistent chrome.** Plugin UI surfaces are route-mounted pages, field types, and settings forms (`src/admin/context/plugin.tsx`, `src/admin/pages/_protected/plugin/$.tsx`). There is **no way to inject a persistent drawer / floating widget**. Confirm primitives exist (`src/admin/components/ui/confirm.tsx`, `DeleteEntryModal.tsx`).

---

## 2. Terminology (Ubiquitous Language)

The canonical layer vocabulary (storage · services · policies · transport · Client · kernel) is defined in [[services-architecture.md]]. The terms below are the AI-specific additions, aligned to it.

| Term                    | Meaning                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **service**             | The CMS's capability verbs (entries, media, users, settings). **Internal/private** (never in user docs); the glue that calls storage and has policies composed onto it. Defined in [[services-architecture.md]].   |
| **service method**      | One verb on a service, e.g. `entries.create`, `plugins.redirects.lookup`. The unit the manifest and the AI deal in.                                                                                                |
| **policy**              | A composable wrapper _over_ services: permissions, visibility, confirmation. Not a tier — just a feature consumed by composition.                                                                                  |
| **transport**           | A projection of service methods into a consumption shape. Public names: **Local API**, **HTTP API**, **CLI**, **MCP server**. Each composes which policies apply.                                                  |
| **Client**              | A consumer of a transport. The HTTP API's **Client** (`fetch`) mirrors the Local API 1:1; same call-site code by import path. Never called "SDK".                                                                  |
| **descriptor**          | A method's self-description: `name`, `summary`, `input`/`output` (Zod), `mutates`, `destructive`/`idempotent`, `permission`. Authored once via `defineServiceMethod`; identical shape for core and plugin methods. |
| **manifest**            | The build-time catalogue of all descriptors (core + plugin), emitted as JSON. The single source for discovery, MCP projection, and confirm-gate metadata.                                                          |
| **confirm gate**        | A deterministic, code-driven interstitial that stages mutating operations and waits for explicit human approval. _Not_ the model judging its own safety.                                                           |
| **ambient context**     | The current view's focus, published by the route as a typed _reference_ and handed to the chat agent to resolve deixis ("this page", "here").                                                                      |
| **addressable context** | Additional references the user pins into the chat (`@`-mention style). Deferred (§6).                                                                                                                              |

---

## 3. Decisions (Locked)

### Architecture & vocabulary

1. **One unified services layer, feature-split in code.** Extract the capability out of `src/sdk/local` (which today conflates _the capability_ with _a transport_). `core` is dissolved over time — permissions, visibility, plugin-runtime move to their own feature directories; only genuinely-core primitives stay. Organisation is provisional and will be re-evaluated as it shakes out.
2. **Transports project services; the Client sits downstream of the HTTP API.** Local API / CLI / MCP / HTTP API are transports. The `fetch` **Client** consumes the HTTP API, not a transport in its own right. Layering: `services → (policies) → transports → Client`.
3. **Policies compose over pure services.** Permissions, visibility (already `withDefaultShape`), and confirmation are middleware a surface opts into. Trusted transports (Local/CLI/MCP/seeding) compose none; the HTTP API composes permissions; the AI tool-loop composes permissions **and** the confirm gate.

### Services, descriptors & the manifest

4. **One shared `defineServiceMethod`** for core _and_ plugin methods, so the manifest walk is uniform. Extends today's `defineSdkMethod` seam (`src/index.ts:90`) and `PluginSdkMethod` (`src/types/plugins.ts`) with descriptor fields.
5. **The descriptor carries already-scattered metadata, consolidated onto the method.** Input schema currently lives in `src/schemas/*`; permission lives in the route's `can()` check. Building self-describing services = _moving_ these onto the descriptor; routes become thin adapters. Net-**new** metadata is minimal (see 6).
6. **Effect metadata uses MCP-aligned boolean hints, not an ordinal risk score.** `mutates` (the query/command split — universal), plus MCP tool-annotation vocabulary `readOnly` / `destructive` / `idempotent`. `mutates` is largely inferable from the verb; `destructive` (delete-user, delete-entry, unpublish) is the small editorial layer actually authored. Chosen because it is the industry standard _and_ maps 1:1 onto the MCP server projection with zero translation.
7. **The manifest is a build-time codegen output**, not a runtime registry — plugin methods are statically known at config time. Emit at `astro:config:done` beside `generateSdkTypes()` (and a parallel `generate:manifest` CLI command mirroring `generate-types.ts`), reading core descriptors + `getPluginSdkMethods()`. Output `.astro/astromech.methods.json`. Discovery (incl. plugin-contributed methods like `redirects.lookup`) is "read the manifest".
8. **Two schema worlds, both carried.** **Method schema** (Zod) = how to _call_ a service method. **Content schema** (`FieldDefinition[]` → JSON Schema, a second walk of the existing type-gen) = what to _fill_ for an entry type. Entry methods link to their type's content schema. Both already convert to JSON Schema via shipped machinery.

### Permissions & safety (two layers + defense-in-depth)

9. **Permission enforcement becomes a composable `withPermissions(principal)` wrapper around services** — the same checks the HTTP API does today, made available to any caller. The AI authoring agent runs through it bound to the requesting user, so it can do exactly what that user can, no more.
10. **The AI sees all methods but is told what it can't use** (visible-but-denied, like a disabled button with a tooltip — _not_ hidden). The manifest is annotated per-principal with permission status so the AI can say _"you don't have permission to publish"_ without wasting a turn.
11. **Defense in depth: the manifest annotation is advisory UX; the wrapper is the security boundary.** Even if the model ignores the hint and attempts a denied call, the wrapper returns a structured `PermissionDenied` and nothing happens. Never trust the model to respect the annotation.
12. **Confirm gate = propose → preview → approve → execute** (the Terraform plan/apply, Claude-Code-prompt, MCP-elicitation pattern), keyed off `mutates`/`destructive`. Code stages the action and holds it until an explicit human click. The confirm dialog makes the concrete target and change legible.

### AI authoring agent & context-awareness

13. **The authoring AI is a single prompt-input agent with a tool-loop over the manifest**, _not_ a set of pre-declared buttons. The user says "create a page" / "add a user with this email" in chat; the agent figures out which service methods to call. Delivered as an **in-built plugin** (gets `PluginContext` with `sdk`, scoped `entries`, `user`, **`env` for the API key**).
14. **Ambient context is reference-only; the tool does the reading.** The current route publishes a typed reference (`{ kind, type?, id?, label }`); the agent uses it to resolve deixis ("this page" → that id). All content is fetched via read operations. Context is **for the AI**; it does not change the user↔AI flow.
15. **No implicit target injection.** Context tells the model what "this" means; the model still emits an **explicit** tool call (`entries.update({ id: X })`). So the confirm gate always shows a concrete target and permissions/gate are never bypassed.
16. **v1 operates uniformly via service methods against persisted state (Mode B everywhere).** After an AI mutation, **invalidate TanStack Query keys** so any open view refetches and shows the change. There are conceptually two modes — **Mode A** (edit the _open_ dirty editor inline, user saves — the Cursor open-file pattern) and **Mode B** (act on something not open: method + confirm + DB + refresh). The logical operation is identical; only the presentation differs by whether the target is the live editor. **v1 collapses to Mode B; Mode A is deferred (§6).**
17. **Dirty-form gate.** If the focused editor has unsaved changes and the user asks the AI to act on _that_ entry, the chat requires a save first. This sidesteps the persisted-vs-dirty mismatch with no live-buffer plumbing.

### Provider adapter & dev surfaces

18. **Start Claude-only behind a clean adapter seam.** The adapter must abstract structured generation + tool-use (not just text completion); don't build multiple provider adapters before the feature shape is proven. BYO key via plugin `env`.
19. **CLI rebuilt as the full surface; drop a Tinker-style `eval`.** TS has no clean interpreter story, and the manifest + tool-loop gives structured, discoverable invocation without eval's sharp edges. Coding-agent break-glass = raw SQL against the local DB.
20. **MCP = dev-only scaffolding, never production-exposed**, projecting the manifest as MCP tools (annotations map directly per decision 6). One-click install wrapper over the CLI/services.

### Admin UI substrate

21. **A slot-based UI-injection point is a prerequisite.** The current plugin UI mounts route-pages/fields/settings but cannot mount persistent chrome. Add named admin-shell slots (`global-overlay`, `right-drawer`, `toolbar`) that plugins contribute components into (VS Code contribution-points / WordPress admin-hooks pattern). The chat drawer cannot mount without this; the AI feature is the forcing function and it generalises to all plugins.
22. **Context contributors are an admin extension point.** A provider/registry where routes — including plugin pages — declare their ambient-context descriptor, mirroring `useAstromechPlugin`. Lives in the admin (client) layer; orthogonal to services.

---

## 4. Why this shape (industry norms)

- **Read/write split** (CQRS, HTTP safe methods, GraphQL query/mutation) is foundational and universal; a graduated "risk score" is bespoke. The conventional decomposition is orthogonal boolean hints — exactly **MCP tool annotations** (`readOnlyHint`/`destructiveHint`/`idempotentHint`).
- **Human-in-the-loop confirmation**: Terraform `plan`→`apply`, Claude Code tool prompts, MCP elicitation, DB dry-runs. Stage → preview → approve → execute.
- **Visible-but-denied** permissions (disabled control + reason) beat hidden capabilities for an authoring assistant's UX; enforcement stays server-side regardless of what the model is shown.
- **Ambient + addressable context** is the Cursor/Copilot model (active file auto-attached, `@`-mentions for the rest).
- **Slot/contribution-point UI injection**: VS Code views/view-containers/status-bar, WordPress admin hooks.

---

## 5. Flow (v1, end-to-end)

1. User opens the chat (drawer mounted via the UI-slot point, §3.21). The current route publishes its ambient reference (§3.14).
2. User: _"Translate this page to French."_ Agent resolves "this page" → the focused entry id (§3.15).
3. If that entry's editor is dirty → chat asks to save first (§3.17).
4. Agent enumerates the manifest, picks `entries.update` (and read ops to hydrate), emits explicit tool calls through `withPermissions(user)` (§3.9).
5. Mutating call hits the confirm gate → preview of the concrete change → user approves (§3.12). Denied calls surface "you don't have permission…" (§3.10–11).
6. Execute against persisted state; invalidate query keys; the open editor refetches and shows the change (§3.16).

---

## 6. Deferred (iterate)

- **Mode A** — inline staged edits in the open dirty editor with accept/reject; needs live-buffer plumbing and an "AI edits form state" path.
- **Addressable / pinned references** — the `@`-mention model; shape TBD.
- **Autosave / richer dirty handling** beyond the v1 save-first gate.
- **Multi-provider adapters** (OpenAI etc.) once the Claude-only shape is proven.
- **`risk`/audit gradations** beyond the boolean hints, if a real need appears.

---

## 7. Workstreams this spawns

1. **Services extraction** — lift the capability out of `sdk/local`; dissolve `core`; `withPermissions` as a composable policy.
2. **Descriptor + manifest** — `defineServiceMethod`, descriptor fields on core + plugin methods, `method-generator.ts`, `generate:manifest`, `.astro/astromech.methods.json`.
3. **CLI rebuild** — full operation coverage, JSON output.
4. **MCP server** — manifest → MCP tools; one-click install.
5. **Confirm gate** — deterministic staging middleware + admin preview UI.
6. **UI-slot injection** — admin-shell contribution points.
7. **Context bus** — ambient-context contributors + chat consumption.
8. **Authoring plugin** — provider adapter seam (Claude), tool-loop, chat drawer.
