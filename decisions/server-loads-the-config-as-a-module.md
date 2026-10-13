---
area: config
---

# The server loads the config as a module

The Astro integration takes the config's path, `virtual:astromech/config` re-exports the author's module, and boot runs in the injected middleware (`packages/astromech/src/integrations/astro/vite.ts`). Drivers, models and `{ custom: fn }` rules reach the serving process as live values. The cost is that the config is evaluated twice.

**Rejected:** passing the config object to the integration; copying live values into registries at build time (the deployed registries are empty).
