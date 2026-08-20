# 0079 — Preview tokens default to a 7-day TTL

**Date:** 2026-08-21
**Status:** accepted

A preview token bypasses the publish gate on an entry. Until
`DEFAULT_PREVIEW_TOKEN_TTL_MS` existed, every token ever issued stayed valid:
`isValid` treats a null `expiresAt` as "forever", and `issuePreviewToken` passed
null whenever the caller named no expiry. It matters more now the confirm gate
hands preview links out as its out-of-band review path — a link pasted into a
chat log stayed live indefinitely.

An omitted `expiresAt` now takes a 7-day TTL. Seven days is long enough for a
human to get to a review and short enough that a stale link stops working.

`null` is kept distinct from absent: an explicit `null` still means "never
expires", so the escape hatch stays — it just has to be asked for now, instead
of being what every caller silently got. `previewTokenSchema` permits null (it
shares `optionalDate`, `.nullable().optional()`) and the repository's `isValid`
honours it.

## Rejected

- **A config key for the TTL.** A constant plus the existing per-call
  `expiresAt` is the whole surface. A site that wants a different lifetime passes
  `expiresAt` per call; nothing yet needs a global override, and adding a config
  key now is surface with no caller.
