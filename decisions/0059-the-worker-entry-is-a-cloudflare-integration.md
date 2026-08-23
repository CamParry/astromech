# 0059 — The Worker entry is a Cloudflare integration

**Date:** 2026-08-17
**Status:** accepted

`createWorkerEntry` in `integrations/cloudflare/`, published as `astromech/cloudflare`, returns `{ fetch, scheduled }` and nominates `cloudflareCron` as default scheduler; `boot/scheduled.ts` deleted, superseding 0053's placement and removing the `navigator.userAgent` sniff. Rejected keeping `handleScheduled` beside it, sniffing inside the integration, and a `platform` config key.
