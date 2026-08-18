# 0066 — The `[Astromech]` prefix is a log device, not part of an error

**Date:** 2026-08-19
**Status:** accepted

`[Astromech]` was hardcoded into the message string of ~40 thrown errors and a
handful of console logs. Because a thrown error does not know where it will be
surfaced — a developer's console or an API response — the prefix leaked: several
wire-mapped domain errors (the `entries.query` validation errors, the
media-access guard) serialised `[astromech] …` straight into the HTTP body a
client received.

The fix splits identity by channel, so the marker only ever appears where it
belongs.

## Thrown errors identify by type

`AstromechError extends Error` sets `name = 'AstromechError'`. The runtime prints
`AstromechError: <message>` wherever an uncaught error surfaces — Astro, the
Workers runtime, the CLI, the MCP server — with no catch site required. `name` is
never read by the HTTP error middleware (it serialises `message` and structured
fields), so the origin marker shows on a console and stays off the wire. The
guard, config, and driver throws use it.

## Wire-mapped errors carry clean messages

Named domain errors that map to an HTTP status (`ValidationError`,
`PermissionDeniedError`, the `entries.query` errors) keep their own class name
and a clean message. Their `message` goes over the wire, so it must not carry a
console marker. They are unchanged apart from the stripped prefix.

## Logs get the prefix from `log`

`utilities/log.ts` owns the one `[Astromech]` string and writes to stderr (the
MCP server owns stdout for JSON-RPC). Deliberate console lines go through
`log.info`/`log.warn`/`log.error`. The prefix now lives in exactly one constant;
no error string contains it.

## Rejected and deferred

- **A throw-helper that prepends the prefix to the message.** Still bakes a
  console marker into a string that may be serialised — the same leak, centralised.
- **Reparenting the named domain errors onto `AstromechError`** for one
  `instanceof` root. Orthogonal to the prefix and not needed to fix it; deferred.
- **Two browser-side admin console calls** (`admin/i18n.ts`,
  `admin/support/ui-instance-guard.ts`) still hardcode the prefix. `log` writes
  to stderr on Node; a browser-safe log is a separate follow-up in `backlog.md`.
