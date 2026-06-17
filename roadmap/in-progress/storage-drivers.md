# Storage Drivers

- [ ] `src/storage/drivers/s3.ts` — S3-compatible driver (`@aws-sdk/client-s3`)
- [x] `src/storage/drivers/r2.ts` — Cloudflare Workers native R2 binding driver (bytes-only `StorageDriver`; shipped with image optimisation)
- [ ] Update `StorageDriver` type + `AstromechConfig` storage config for new driver options
- [ ] Wire R2 binding from the Workers `env` object in the Cloudflare adapter
