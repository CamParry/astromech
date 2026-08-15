# Decisions

One file per decision, named `NNNN-kebab-title.md`, never edited once written —
supersede it with a later record instead. Numbers are unique and never reused.

This is where rationale and history live: why a name was chosen, what was
rejected, what the trade-off was, and what a thing used to be. It is deliberately
**not** in code comments, which describe what the code does and are read by
someone trying to change it, not someone re-litigating the choice — and not in
`ARCHITECTURE.md` or `TERMINOLOGY.md`, which describe only the present.

Every record opens with the same block:

```markdown
# NNNN — Short title

**Date:** YYYY-MM-DD
**Status:** accepted
**Supersedes:** NNNN (only when it does)
```

`Status` is `proposed`, `accepted`, or `superseded by NNNN`.

Distinct from the neighbouring directories:

| Where             | Holds                                          |
| ----------------- | ---------------------------------------------- |
| `decisions/`      | why a choice was made — permanent, append-only |
| `roadmap/`        | what is planned, in progress, or done          |
| `specs/`          | in-flight designs, deleted once shipped        |
| `TERMINOLOGY.md`  | what a term means today                        |
| `ARCHITECTURE.md` | how the code is laid out today                 |

## The records

- [0001](0001-forms-vocabulary-and-table-directories.md) — forms vocabulary, and `tables/` over `schema/`
- [0002](0002-forms-notifications-and-spam-providers.md) — forms notifications as blocks, and spam as a provider contract
- [0003](0003-data-layer-locks-and-rejected-options.md) — data layer: what was locked, and what was rejected
- [0004](0004-relationships-as-a-derived-index.md) — relationships as a derived, rebuildable index
- [0005](0005-ai-context-naming.md) — "AI context", and the names rejected on the way
- [0006](0006-media-update-permission.md) — `media:update` split out of `media:upload`
- [0007](0007-plugin-core-boundary.md) — how plugin code reaches core
- [0008](0008-plugin-methods-port.md) — `ctx.methods`, and what shape it takes
- [0009](0009-service-method-client-vocabulary.md) — one noun per role: service, method, client, API
- [0010](0010-media-browser-composition.md) — the media browser shares plumbing, not layout
- [0011](0011-documentation-structure.md) — one question per document, and no history in the map
- [0012](0012-driver-not-adapter.md) — "driver" over "adapter" for pluggable backends
- [0013](0013-chat-transcript-as-content-blocks.md) — the chat transcript crosses the wire as content blocks
- [0014](0014-naming-the-ai-tool-surface.md) — naming the AI tool surface: `ToolDefinition`, `AIContextItem`, `transport/tools/`
- [0015](0015-public-subpaths-mirror-the-source.md) — a public subpath mirrors its source directory, and the fetch client is `astromechClient`
- [0016](0016-the-fields-module-vocabulary.md) — the `fields` module's vocabulary: layout field, nested field, `boxed`, `formatInstancePath`
- [0017](0017-resource-as-the-superordinate-noun.md) — `resource` for an entry, a media item, a user or a settings page, and the resource validators
- [0018](0018-one-chat-session-not-a-library.md) — the assistant keeps one resumable chat session per user, not a browsable library of past ones
- [0019](0019-a-define-returns-the-thing.md) — a `defineX` returns an `X`; `Descriptor` and `Definition` stop being suffixes
- [0020](0020-approval-as-a-server-held-row.md) — an approval is a server-held row, claimed and answered in one conditional update
- [0021](0021-ai-as-an-optional-core-capability.md) — AI as an optional core capability, absent unless configured
- [0022](0022-core-hands-out-a-model.md) — core hands out a model; it does not wrap generation
- [0023](0023-ai-sdk-over-vendor-and-agent-frameworks.md) — AI SDK over the vendor SDK and over agent frameworks
- [0024](0024-removing-the-content-operations.md) — removing the content operations, and what must return with them
- [0025](0025-html-as-the-rich-text-interchange-format.md) — HTML as the rich-text interchange format
- [0026](0026-the-assistant-package-name.md) — `@astromech/assistant`, and the "authoring" the rename left alone
- [0027](0027-the-assistant-loop-on-streamtext.md) — the assistant's loop runs on `streamText`, and keeps its own approval gate
- [0028](0028-d1-degrades-rather-than-refusing-to-boot.md) — D1 degrades to sequential writes rather than refusing to boot
- [0029](0029-an-unknown-where-key-throws.md) — an unknown entries-list `where` key throws instead of being dropped
- [0030](0030-the-server-loads-the-config-as-a-module.md) — the server loads the config as a module, and boots itself on the first request
- [0031](0031-the-plugin-config-view-is-an-allow-list.md) — `ctx.config` is an allow-list projection, not the resolved config
- [0032](0032-a-capability-slot-holds-what-the-config-declared.md) — a capability slot holds what the config declared, `media.image` over three flatter shapes
- [0033](0033-the-repo-resolves-src-and-npm-gets-dist.md) — the repo `exports` map resolves `src`, `publishConfig.exports` gives npm `dist`
- [0034](0034-generated-field-types-are-aliases-and-the-gate-boots-a-server.md) — generated field types are `type` aliases, and `check:boot` builds and boots the demo
- [0035](0035-one-namespace-and-one-declare-global.md) — one `globalThis.__astromech` namespace and one `declare global`, plus `createKeyedRegistry`
- [0036](0036-one-layer-table-and-a-shared-suffix.md) — the layer rules generate from one `LAYERS` table, and `*.shared.ts` replaces the admin allowlist
- [0037](0037-session-scoped-service-methods.md) — a method whose subject is the caller declares `sessionScoped`, and the scoped handle fills it
- [0038](0038-a-route-declares-itself.md) — a route declares itself, and one table is read by the handler, the document and the client
- [0039](0039-a-contract-lives-with-the-layer-that-implements-it.md) — a contract lives with the layer that implements it, and the plugin context is why the domain contracts cannot follow
- [0040](0040-policies-and-manifest-registry-keep-their-directories.md) — `policies/` over `guards/`, and `manifest-registry.ts` stays in `codegen/`
- [0041](0041-the-admin-split-is-blocked-and-ui-is-browser-only.md) — the admin package split waits on two prerequisites, and `astromech/ui` does not load under Node
- [0042](0042-domain-contracts-stay-centralised-in-the-leaf.md) — domain contracts stay centralised in the types leaf
- [0043](0043-field-queries-ride-declared-expression-indexes.md) — field-value queries ride declared expression indexes, not columns and not a lookup table
- [0044](0044-search-is-a-derived-fts5-index.md) — search is a derived FTS5 external-content index, not a column on `entries`
- [0045](0045-the-asset-root-stays-declared.md) — the asset root stays declared, not inferred
- [0046](0046-worktrees-live-outside-the-checkout.md) — worktrees live outside the checkout, so they can verify their own work
- [0047](0047-pnpm-is-the-package-manager.md) — pnpm replaces npm workspaces, so an undeclared dependency fails instead of hoisting
- [0048](0048-the-supported-node-floor-is-22-13.md) — the supported Node floor is 22.13, because pnpm 11 requires it and an untested range is worse than a narrow one
- [0049](0049-ci-tests-the-floor-and-the-active-lts.md) — CI tests the engines floor and the Active LTS, and only the jobs where the runtime can differ
- [0050](0050-every-published-package-states-and-enforces-the-node-floor.md) — every published package states the Node floor, and the types and build enforce it
- [0051](0051-settings-are-content-config-is-code.md) — settings are content, config is code, secrets are env-only, and core ships no settings page
