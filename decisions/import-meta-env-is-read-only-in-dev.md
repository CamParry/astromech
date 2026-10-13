---
area: config
---

# Core reads `import.meta.env` only under dev

Under `astro dev`, `virtual:astromech/config` exports `import.meta.env` and the middleware passes it to `setViteEnvSource`; in a build that export is `undefined` (`packages/astromech/src/integrations/astro/vite.ts`). Core reads `import.meta.env` nowhere else.

**Why:** in a build, Astro replaces a whole-object `import.meta.env` read with every build-machine variable named in that module, which puts values such as the build's `NODE` path into the Worker bundle.

**Rejected:** reading `import.meta.env` where a value is needed; passing it in builds too.
