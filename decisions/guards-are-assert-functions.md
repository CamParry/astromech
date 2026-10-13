---
area: structure
---

# A guard is an `assert*`, not a bare `get*`

`get*` returns the thing or throws, `resolve*` returns it or `undefined`, and a call made only for its throw is an `assert*` returning `void` ([naming conventions](../roadmap/planned/naming-conventions.md) converts today's bare `get*` guards). Testing Library splits `getBy*` and `queryBy*` the same way. The public reads `getEntry`, `getCurrentUser` and `getCurrentRole` return `null`, as Astro's `getEntry` returns `undefined`.

**Rejected:** `require*` (Remix's `requireUserId` redirects; here it is middleware's prefix); `OrThrow` or `OrFail` suffixes (Prisma, Laravel; on about 30 accessors); a bare `get*` with a comment.
