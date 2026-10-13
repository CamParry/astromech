---
area: structure
---

# A repository is a module-level object

A core repository is built once when its module loads (`export const userRepository = createUserRepository()`) and reads the db handle and default locale on each call, so a transaction scope reaches it; a test swaps a method with `vi.spyOn`. A plugin repository is a `createXRepository(ctx.db)` factory built inside the call, since `ctx.db` is a plugin's only handle. Strapi's global `strapi` works the same way.

**Rejected:** a `globalThis` slot per repository with a setter (protects nothing; no surveyed CMS has one); a repository built per call from `ctx.config`; repositories on `ctx` (a per-site value on a per-call object).
