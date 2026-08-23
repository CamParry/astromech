# 0088 — `get` throws, `resolve` may return undefined, `require` is middleware

**Date:** 2026-08-22
**Status:** accepted

`get*` returns and throws, `resolve*` may return `undefined`, `assert*` returns void, `require*` is reserved for request middleware. `requireTrash`/`requireStaging` are deleted in favour of inline `assertCapability` plus a destructured local (TypeScript discards narrowing in closures), and `loadAndAssertType` becomes `getEntryOfType` rather than `getEntryOrThrow`.
