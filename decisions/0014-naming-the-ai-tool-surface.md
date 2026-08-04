# 0014 — Naming the AI tool surface

**Date:** 2026-08-04
**Status:** accepted

Three renames from one review of the AI integration, decided together because
they share a rationale: each name described the code's plumbing rather than the
thing it produced. Extends `0005-ai-context-naming.md` and follows the same test
as `0009-service-method-client-vocabulary.md` — one noun per role, taken from
the ecosystem where one exists.

## `ToolDispatch` became `ToolDefinition`

The shape is `{ name, description, inputSchema, annotations, permission,
permissionDynamic, invoke }`. That is a tool definition plus its handler, which
is what MCP, the Anthropic SDK and every model SDK call it. "Dispatch" as a
noun for the artifact was a coinage.

The evidence it was wrong is that no call site kept the word. `buildScopedTools`
built `const tools: ToolDispatch[]`; the plugin port exposed it as `tools()`;
the authoring loop took `dispatches` and immediately assigned them to `tools`.
Every reader translated it back, which is the cost a coined name imposes on all
of them rather than once on the author. Its field `toolName` became `name`, which
also removes the stutter.

The verbs survive. `buildDispatch`, `buildScopedDispatch` and `DispatchResult`
still describe what they do — resolve a manifest method to a call — and renaming
them would have obscured the distinction those two functions exist to draw
(`0008-plugin-methods-port.md` covers why a separate scoped builder is
load-bearing).

`ToolSpec` was considered and rejected: "spec" means an unimplemented
description, and this carries the implementation. `McpToolDef` in
`transport/mcp/tools.ts` was deliberately left alone, because it is genuinely
the MCP wire shape and the two types are not the same thing.

## `AIContextEntry` became `AIContextItem`

The type is a reference plus its position in the ordered list. "Entry" is the
core content domain — `entriesService`, entry types, and `kind: 'entries'`
inside this very feature — so the name pointed a reader at content it has
nothing to do with. `useAIContextEntries` became `useAIContextItems` with it,
and the type moved beside `AIContextReference` in `types/ai-context.ts`; the two
had been one concept split across two files by where the formatter happened to
live.

`AIContextDeclaration` was the closest rival and reads more accurately, since a
route declares rather than lists. It lost for being a word a reader has to be
taught, against `0005`'s own rule about coinage. Flattening the wrapper into
`AIContextReference` was also considered and rejected: the split between what a
route claims and where that claim sits in the order is real, and collapsing it
would have put ordering fields on the type routes construct by hand.

## `transport/mcp/` gave up the shared tool surface

`dispatch.ts` and `scoped-tools.ts` moved to `transport/tools/`. The latter said
in its own docblock that it "serves the AI tool-loop as well as MCP", and its
actual consumer is the authoring plugin over HTTP. A path that claims MCP-only
is a false statement about who may depend on it. `server.ts` and `tools.ts` stay
where they are, because they really are MCP.

The move exposed the reason directory names carry weight beyond readability: the
dependency-cruiser rule `transport-no-reach-boot` matched
`^src/transport/(http|local|mcp)/`, so the new directory would have fallen out
of enforcement without a word of warning. Any future transport directory needs
that rule checked.
