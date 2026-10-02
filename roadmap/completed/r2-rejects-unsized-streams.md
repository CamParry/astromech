# The R2 driver rejects a stream of unknown length

`StorageDriver.put` (`packages/astromech/src/types/config.ts`) promises any
`ReadableStream`, but the R2 driver (`packages/astromech/src/storage/drivers/r2.ts`)
passes a stream to `bucket.put` unchanged, and R2 refuses one without a known
length ("must have a known length"). Found by the storage driver contract test
in stage 4 of [test-suite-review](../completed/test-suite-review.md).

Where it bites:

- **Node through wrangler's proxy** (the CLI, scripts and tests, as
  `apps/docs/configuration/storage.md` describes): every non-image media upload
  fails, because `packages/astromech/src/media/internal/store-file.ts` passes
  `file.stream()`, which carries no length through the proxy.
- **A deployed Worker**: a media upload is likely fine, because a `File` from
  `request.formData()` streams with a known length (not tested here). A
  plugin's `ctx.storage.put` with a stream it built, such as a compression
  pipe, is refused.

S3 is outside the contract test, because it needs an S3 server; its tests stub
`fetch`.

## The work

- [x] In the R2 driver, wrap a stream of known length in `FixedLengthStream`
      and buffer one of unknown length, or narrow `StorageDriver.put` and say
      so in its doc comment. Turn the contract test's expected failure for R2
      into a passing case.
