# Explicit app context

`AppContext` is the only value that flows below a transport. The request store
stays, as transport plumbing, and is renamed so "context" means only the
explicit value. Ships on the `services` branch with
`policy-in-the-service-layer.md`.

The two are not merged. The store must load before the config resolves, so it
cannot hold services, and the CLI, cron, plugin `setup()` and MCP need an
`AppContext` with no request behind it. A Payload-style `req` would need a
fabricated request for each (Payload's `createLocalReq`), and `DECISIONS.md`
already holds that nothing below a method reads the store.

## Where the split leaks today

- Hooks and plugin method calls rebuild their context from the store instead of
  inheriting the caller's (`plugins/runtime/plugin-runtime.ts`, the `addHook`
  wrapper; `plugins/runtime/plugin-services.ts`). A method run with an explicit
  `AppContext` fires its hooks as whoever the store holds, often nobody.
- User and role are copied into the store, `AppContext` and Hono's `c.var`.
  Routes check `permissionsFor(c.var.role)`; services act as the store's user.
- `currentAppContext()` builds a fresh, uncached system context on every call
  outside a request (`app-context/app-context.ts`).
- `createPluginContext` builds a new `AppContext` in five places, and hooks get
  no `clientAddress` while plugin methods do.
- `app-context/services.ts` `bindCurrent` keeps a second per-context binding
  cache beside `createAppContext`'s lazy getters.
- `scopedServices(role)` wraps every method of every domain on every call.
- An authenticated API request resolves its session twice: the Astro middleware
  opens a request store, then `transport/http/app.ts` opens a second.
- `CronContext = { db, config }` (`cron/registry.ts`) is a third context type.

## The work

- [ ] `createPluginContext(identity, ctx: AppContext)`; `AppContext.runHook`
      passes its own ctx to the hook, and `ctx.plugins` binds to the ctx.
- [ ] `scopedServices(ctx)` and `buildScopedTools(ctx)` take the context, bind
      with `definition.bind(ctx)` and read `ctx.role`; build the scoped handle
      once per ctx; delete the store read in `requireSubject`.
- [ ] Hono's auth middleware sets `c.var.ctx`, replacing `c.var.user` and
      `c.var.role`; raw plugin routes receive it.
- [ ] Retire `CronContext`: jobs get a system `AppContext`, cached once per boot.
- [ ] `bindCurrent` calls the method on `await currentAppContext()` directly
      and drops its own WeakMap cache.
- [ ] `transport/http/app.ts` reuses an open request store instead of nesting a
      second one.
- [ ] Rename the store to request scope, matching the existing transaction
      scope: `RequestContext` → `RequestScope`, `runWithContext`/`runWithRequest`
      → `runInRequestScope`, `getRequestContext` → `getRequestScope`,
      `request-context/` → `request-scope/`. Add a `TERMINOLOGY.md` entry.
- [ ] Add `@/app-context/services` to the lint rule's ambient sources for the
      content modules.
- [ ] Document that `ctx.db` is read per query, never kept: a repository built
      from it outside `transaction(fn)` does not join the transaction
      (`plugins/assistant/src/service/sessions.ts`, `plugins/backups/src/backup.ts`).
- [ ] Record in `DECISIONS.md`: a hook fired from cron or plugin `setup()` runs
      as the system, even inside an admin's HTTP request such as `/cron/run`.
