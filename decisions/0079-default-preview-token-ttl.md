# 0079 — Preview tokens default to a 7-day TTL

**Date:** 2026-08-21
**Status:** accepted

An omitted `expiresAt` on a preview token now gets a 7-day TTL (`DEFAULT_PREVIEW_TOKEN_TTL_MS`) instead of never expiring; explicit `null` still means never. Rejected a config key for the TTL as surface with no caller.
