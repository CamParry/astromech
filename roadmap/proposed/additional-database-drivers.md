# Additional Database Drivers

D1 was split out of this file on 2026-07-29 when it was built — see
`completed/d1-driver.md`.

## Other dialects

Note v1 is SQLite-only; Postgres and MySQL are a future major.

- [ ] `packages/astromech/src/database/drivers/postgres.ts` — Postgres driver
- [ ] `packages/astromech/src/database/drivers/mysql.ts` — MySQL driver
- [ ] `defineTable` descriptor / DDL-emitter dialect variants for Postgres/MySQL column types
- [ ] Migration pipeline per dialect
- [ ] Update `AstromechConfig` DB config type for each dialect
- [ ] Test coverage for each new driver
