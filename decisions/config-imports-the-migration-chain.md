---
area: config
---

# The config imports the migration chain

`db:generate` writes `migrations/index.ts`, which exports the chain as a Kysely `MigrationProvider`, and the config passes it as the required `migrations` key. Boot, the CLI, the Astro integration and a backup restore all read the chain from there, so a Worker applies migrations with no file system. Where a file system exists, a chain that differs from `journal.json` is refused (`packages/astromech/src/database/app-migrations.ts`). Payload's `prodMigrations` takes the same import ([docs](https://payloadcms.com/docs/database/migrations#running-migrations-in-production), [D1 adapter](https://github.com/payloadcms/payload/blob/main/packages/db-d1-sqlite/src/index.ts)).

**Rejected:** a virtual module (hides the import; the CLI has no Vite); a `createWorkerEntry` option (Workers only); loading from `migrationsDir` with names bundled for Workers (two paths).
