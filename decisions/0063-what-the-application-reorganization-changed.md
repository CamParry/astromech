# 0063 — Where the application reorganization landed differently from 0057

**Date:** 2026-08-18
**Status:** accepted

Records five reversals of 0057 without superseding it: `createAstromech` creates (idempotent) while `getAstromech` only reads; `config/` sits in capabilities not above domains; the CLI supplies config and the `virtual:` shim is deleted; one `basePath` (`/cms`) replaces `adminRoute`/`apiRoute` (`mediaRoute` stays separate); the Hono app is built at boot at absolute paths. Rejected rewriting 0057 or blanket supersession.
