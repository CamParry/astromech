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
