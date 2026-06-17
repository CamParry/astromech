# API & SDK

- [x] Hono API (`src/transport/http/`): entries, users, media, settings, entry-types routes; auth + error middleware; Zod validation on all handlers; standardised `{ data }` response shape; configurable `apiRoute`/`adminRoute` (default `/api`)
- [x] `astromech/local` (direct DB) and `astromech/fetch` (HTTP) SDKs covering entries, users, media, settings (renamed from `server`/`client`)
- [x] Collection-specific TypeScript type generation from config; relations via `populate`
- [x] Typed entries API: single options object, required `type`, polymorphic atomic bulk ops, DB-enforced `type`+`id` matching, cross-type `query`
- [x] Consolidated `query()` for entries/users/media — `search`/`where`/`trashed`/`sort`/`page`/`limit`/`populate`/`locale`; `QueryResult<T>` with nullable pagination; Drizzle-style sort with whitelist validation
- [x] `EntryStorage` abstraction with boot-validated capabilities (`statuses`/`slug`/`translatable`/`versioning`/`trash`) and `titleField`
- [x] CORS (same-origin default, opt-in origins) + secure-headers middleware
