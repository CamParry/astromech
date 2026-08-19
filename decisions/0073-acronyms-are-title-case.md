# 0073 — Acronyms in identifiers are title-case, with no length exception

**Date:** 2026-08-19
**Status:** accepted

An acronym inside an identifier is written `Xyz`, not `XYZ`, however short it
is. `AiConfig`, `useAiContext`, `UiProvider`, `HttpVerb`, `ApiErrorCode`,
`JsonValue`, `entryId`.

This settles a rule the codebase was already keeping everywhere except two
words.

## The evidence

The convention was not chosen here so much as counted. Distinct identifiers
containing each acronym, across `packages/*/src`:

| Acronym | Written                                          | Distinct identifiers |
| ------- | ------------------------------------------------ | -------------------- |
| `Id`    | `entryId`, `EntryTypeId`, `resourceId`           | 112                  |
| `Url`   | `coerceUrl`, `getSignedUploadUrl`, `publicUrl`   | 25                   |
| `Api`   | `ApiErrorCode`, `AstromechApiError`, `pluginApi` | 14                   |
| `Json`  | `isJsonValue`, `JsonColumn`                      | 12                   |
| `Db`    | `getDb`, `DbClient`                              | 7                    |
| `Mcp`   | `McpTool`, `mcpRoutes`                           | 5                    |
| `Http`  | `HttpVerb`, `HttpRouteSpec`, `createHttpApp`     | 3                    |
| `Smtp`  | `smtp()`                                         | 1                    |

Against that, exactly two words were all-caps: `AI` (eighteen identifiers, led
by `AIConfig` and the `AIContext*` family) and `UI` (five, declared in
`admin/context/ui.tsx` and consumed by the three layout components). Both are
renamed.

Nothing else changes. Platform globals keep the spelling the platform gave them
(`URL`, `URLSearchParams`, `crypto.randomUUID`), third-party config keys keep
theirs (better-auth's `baseURL`), and SCREAMING_SNAKE constants and environment
variables are a separate convention (`DATABASE_URL`, `S3_PUBLIC_URL`) that this
does not touch.

The `URL` half of the sweep turned out to be empty. Every Astromech-owned
identifier containing "url" was already `Url`.

## Why no two-letter carve-out

The obvious softer rule is "title-case acronyms of three letters or more, leave
two-letter ones alone", which would have kept `AIConfig` and `UIProvider` while
still requiring `Http` and `Json`. Google's TypeScript style guide and .NET's
framework guidelines both draw the line roughly there, so it is not a strange
place to draw it.

It loses on this codebase's own evidence: `Id` is a two-letter acronym written
title-case in 112 identifiers. A length rule would either have to except `Id`
from the exception, or force `entryID` and `EntryTypeID` across the whole
source. Neither is worth having.

It also loses on the general point. A length-dependent rule is one a
contributor has to look up before naming something, and looking it up requires
knowing the rule is length-dependent in the first place. "Title-case, always"
is guessable cold by someone who has read any three files here. The carve-out
buys a marginally more familiar spelling for two words and charges a rule that
must be taught for every word.

`useAiContext` and `useUi` are the two results that read least naturally. That
is accepted: they are consistent with `useUi`'s neighbours in the same file and
with every other acronym in the source, and consistency is the property being
bought.

## What this costs

Several renamed symbols are re-exported from the package root
(`AIConfig`/`AiConfig`, the `AIContext*` family, `useAIContext`), so this is a
breaking change to the public surface. Nothing is published to npm yet, which
is the whole reason to do it now rather than after the first release.

`decisions/0005-ai-context-naming.md` and
`decisions/0014-naming-the-ai-tool-surface.md` argue for the _words_ "AI
context" and `AIContextItem`. Those arguments stand unchanged; only the casing
moves. Neither record is edited, per the append-only rule.
