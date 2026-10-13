---
area: toolchain
---

# Each wrangler test file gets its own state

Wrangler keeps local D1 and R2 state under the working directory, and two test files starting it at once raced on it. So each such file copies core's `wrangler.jsonc` into its own temp directory and runs wrangler there (`packages/astromech/tests/_support/wrangler.ts`). They run in a `core-wrangler` project on the `forks` pool, because a worker thread cannot `process.chdir()`.

**Rejected:** running the files one after another (hides the shared state); passing `persist` from `resolveBinding()` (changes product code for a test); spying on `process.cwd()` (workerd resolves the state path against the real directory).
