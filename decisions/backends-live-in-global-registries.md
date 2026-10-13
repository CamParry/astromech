---
area: config
---

# Backends are read from global registries

`db`, `storage`, `email`, `media.image`, `ai`, `scheduler`, `plugins` and `migrations` are declared in config and read from a registry holding what was declared. Per-entity behaviour (`validate`, `hooks`, `access`, `url`) stays in config. Every registry lives on the one `globalThis.__astromech` namespace (`packages/astromech/src/registry.ts`).

**Why:** the config module is not importable from all four module graphs, and the package can load twice in one process (source and `dist`, two builds, Vite aliases).

**Rejected:** importing the config wherever a backend is needed; module-scope singletons.
