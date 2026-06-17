# Services Architecture — layers, vocabulary, and the public/internal boundary

**Status:** Designed (discussion 2026-06-17); not yet implemented. Defines the **target shape** for the upstream SDK/core refactor. The staged execution plan lives in [[services-refactor-plan.md]] (TBD).
**Supersedes:** the ad-hoc `local SDK` / `fetch SDK` / `core` naming and layering.
**Touches:** cross-cutting reorganisation — `src/sdk`, `src/core`, `src/api`, `src/cli`, `src/schemas`, `src/support`, `src/index.ts`, and the eventual MCP package.
**Related:** [[ai-integration.md]] (consumes this vocabulary), [[plugin-architecture.md]], [[content-visibility.md]], [[unified-architecture.md]].

---

## 1. Background & Motivation

Two long-standing muddles block clean growth (and, downstream, the AI work in [[ai-integration.md]]):

1. **"SDK" vs "API" was never pinned down.** `astromech/local` and `astromech/fetch` are both called "SDK," yet they sit at different layers — one is an in-process access point, the other is a client of the HTTP boundary. "API" colloquially means HTTP, but the system exposes several programming interfaces that aren't HTTP.
2. **`src/core` is a sinkhole.** It holds ~6 unrelated concerns (policies, the plugin system, config resolution, entry-domain helpers, codegen, rendering) under one undifferentiated name, and the actual capability verbs live conflated inside `src/sdk/local` (which is simultaneously _the capability_ and _one access point_).

This document fixes the **vocabulary and layering** so the refactor has a target to aim at. It deliberately does **not** do domain-driven design — "domain" as a layer name is rejected (§4) as over-claiming for what is really just _rules_.

---

## 2. Terminology (Ubiquitous Language)

| Term                 | Meaning                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **storage**          | Persistence. Tables, repositories, storage adapters. Knows data, not rules.                                                                                                                           |
| **service**          | A capability grouping: the _entries / media / users / settings_ service. **Internal and private** — see §5.                                                                                           |
| **service method**   | One verb on a service, e.g. `entries.create`. The unit the manifest and the AI deal in. Declared via `defineServiceMethod`, carrying its descriptor.                                                  |
| **descriptor**       | A service method's self-description: `name`, `summary`, `input`/`output` (Zod), `mutates`, `destructive`/`idempotent` (MCP-aligned hints), `permission`. Identical shape for core and plugin methods. |
| **services (layer)** | The glue that binds the core: service methods call storage via its interface and have policies composed onto them. Bare functions — _unaware of delivery shape_.                                      |
| **policy**           | A composable wrapper _over_ service methods: permissions, confirmation. Rules live inside the policy; nothing is a separate "domain" layer. (Visibility is **not** a policy — see Decision 8.)                |
| **transport**        | _(internal word)_ A projection of service methods into a consumption shape for a given environment/consumer. Local, HTTP, CLI, MCP are transports — mirrors of one set of methods.                    |
| **Client**           | A _consumer_ of a transport. The HTTP API's **Client** mirrors the Local API 1:1; same call-site code, selected by import path. Never called "SDK."                                                   |
| **kernel**           | The composition root: boots and assembles services + policies + transports into the published package. It _composes_; it does not _conduct_ (not an "orchestrator").                                  |

**Public product names** (what website developers actually use): **Local API**, **HTTP API** (+ its **Client**), **CLI**, **MCP server**. The word "transport" is the _internal category_; it does not appear in user-facing docs.

**Retired terms:** `SDK` (as a layer/architectural term), `domain` (as a layer), `operations`, `orchestrator`, `surfaces`, `local SDK` / `fetch SDK`.

---

## 3. The layer model

```
storage
  ↑
services        (service methods; the glue — call storage, compose policies)
  ↑
policies        (permissions · confirmation — composable wrappers)
  ↑
transport       (local · HTTP · CLI · MCP — projections of the same methods)
  ↑
Client          (consumer of a transport; the HTTP Client mirrors the Local API)

        ╰── all assembled at the kernel → published as the Astromech package
```

**Dependency-direction invariant (the thing to hold sacred — more than folders):**
`services` depend on nothing above them → `policies` wrap services → `transports` compose services + policies → `Client` consumes a transport. No upward dependencies; the graph stays acyclic.

**Two schema worlds** carried through the layers (per [[ai-integration.md]]): **method schema** (Zod — how to _call_ a service method) and **content schema** (`FieldDefinition[]` → JSON Schema — what to _fill_ for an entry type).

---

## 4. Decisions (Locked)

1. **Vocabulary:** _service_ (one grouping) / _services_ (the layer) / _service method_ (one verb). Reached through discussion 2026-06-17.
2. **No "domain" layer.** "Domain" implies a DDD vertical/horizontal slice and over-claims. Rules dissolve into their **policy** (permission matching → permissions policy), into the **feature** that owns them (visibility → `services/<feature>/visibility.ts`, see Decision 8), or into **support** helpers (field flattening, url/slug).
3. **Permissions = a composable wrapper, not a bypass flag.** Each service method _declares_ its required `permission` on its descriptor (one place, DRY). Enforcement is a single `withPermissions(principal)` wrapper that reads that declaration. **Trusted transports (Local for SSR/hooks, CLI, MCP) don't compose it; the HTTP API and the authoring agent do.** Rejected: a `bypass: boolean` on the service — an opt-out default is an auth footgun (a forgotten/leaked `true` silently disables auth, invisible to audit). The rule is _"you can't do what you weren't handed,"_ not _"everything unless you remember to say don't."_
4. **Local is a transport.** A service method is just a loose function; it doesn't know about `Astromech.entries.create` paths or delivery shape. The **Local API** is the transport that projects the bare methods into the ergonomic nested importable object — exactly as the **HTTP API** projects them over the wire and the **MCP server** projects them as tools. The three are mirrors for different environments/consumers.
5. **"transport" is the internal umbrella; public names are per-transport.** "API" is the public name for the _code-callable_ transports only (Local API, HTTP API). The **CLI** and **MCP server** are not "APIs" — naming them honestly beats forcing symmetry. This keeps "transport" out of user docs (and sidesteps its slight network flavour).
6. **`kernel`** for the boot/compose root (Symfony/Laravel precedent); the literal file stays `index.ts`/`main`.
7. **`SDK` retired** as an architectural term: it only ever covered Local + HTTP, never CLI/MCP, and is not used for the Client. The published artefact is just the **Astromech** package.
8. **Visibility is per-feature read-shaping, not a policy.** _(Amended 2026-06-17, Stage 6.)_ The original model listed visibility as a policy (a wrapper transports compose). The code proved otherwise: visibility is pure computation with a single consumer per feature (entries' public/full shape + audience filter; settings' public-key rule), it is **always** applied by reads (unlike permissions, which trusted transports skip), and its filter is interleaved with the query (e.g. entries pushes `status:'published'` into the storage where-clause for pagination correctness — unliftable into an output wrapper). So each feature owns its visibility rules in `services/<feature>/visibility.ts`. `policies/` holds only genuine wrappers (permissions, future confirmation). When a second feature needs the shared `VisibilityShape` (`'public' | 'full'`) vocabulary, promote that type to `types/`; until then it lives with entries. See [[content-visibility.md]].

---

## 5. The public / internal boundary

A hard rule that the naming exists to enforce:

- **Services are internal and private.** A developer _using_ the CMS should never see "services" in the documentation, except in sections explicitly explaining internals. Services are not a public access point.
- **Transports are the public access points.** Everything a website developer touches is a transport (Local API, HTTP API + Client, CLI, MCP server). Every transport is a mirror — anything doable via the Local API is doable via the HTTP API and the MCP server; they differ only by environment and consumer.
- The **Client** is the consumer most developers actually hold: it 1:1 mirrors the Local API, so the same code runs server-side (in-process Local API) or client-side (over HTTP) depending on the import.

---

## 6. Prior art

The "service layer + transport layer" split is textbook, not invented:

- **Directus** — closest analogue: core **Services** (`ItemsService`, `FilesService`, `UsersService`) consumed by the REST API, GraphQL API, and JS SDK. Mirrors _services → transports → package_.
- **Strapi** — **controllers (transport) → services (logic)** by the same names.
- **NestJS** — `@Injectable()` providers/services hold logic; controllers are the transport.
- **Go kit** — explicit **service → endpoint → transport** layering; validates "transport" as the term for HTTP/gRPC/etc. access points.
- **Payload** — transports named as **APIs**: "Local API" (≈ our Local API), REST API, GraphQL API.
- **Architecture Patterns with Python (cosmicpython)** — an explicit **service layer** plus an **entrypoints** layer.
- **Hexagonal / Ports & Adapters** — transports are the (driving) **adapters** (word avoided here: `src/adapters` already means framework integrations).
- **Clean Architecture** — the same logic layer is **use cases**; the web is a **"delivery mechanism."**

---

## 7. Out of scope / next

- **Folder layout** (hybrid: feature modules for entries/media/users/settings + cross-cutting modules for permissions/visibility/plugins/codegen) and the **staged move/rename/split plan** → [[services-refactor-plan.md]] (next).
- **The method manifest, descriptor fields, confirm gate, MCP server, authoring agent** → [[ai-integration.md]], which consumes this vocabulary.
