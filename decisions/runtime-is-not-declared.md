---
area: config
---

# No runtime is declared

The entry a site deploys says which runtime it is: `createWorkerEntry` supplies bindings and nominates `cloudflareCron()`, and workerd fills `process.env` from wrangler `vars` (`packages/astromech/src/integrations/cloudflare/worker.ts`).

**Rejected:** a `runtime` config key (its main job, refusing `d1({ binding })` off Workers, is wrong: wrangler's proxy serves it in Node); a `RuntimeIntegration` interface with one member; importing `env` from `cloudflare:workers` (resolves only inside a workerd bundle).
