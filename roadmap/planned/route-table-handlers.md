# REST handlers derived from the route table

Once no route carries policy, a REST handler is fully derived from its row in
the route table, and a test holds every transport to the same answer.

## Why

- Each router hand-writes argument extraction (`param`, `flag`,
  `contentArgs`, `keyArgs`, `listArgs`, `getArgs`) in `routes/entries.ts`,
  `routes/globals.ts`, `routes/users.ts` and `routes/media.ts`, and `full` is
  parsed two ways.
- `routes/entries.ts` is about 600 lines of query-string parsing, access
  ordering, a contract cache and bespoke routes.
- `rpc-parity.test.ts` and `mcp/parity.test.ts` check that a method is
  reachable, not that it answers the same; neither would have caught the
  publish bypass.

## The work

- [ ] `mountRestRoutes` builds args from path params, `queryArgs` and the body,
      parsed by the method's input schema; delete the per-router helpers.
- [ ] Bulk methods take `ids` and `wireNames` goes, matching the `code` skill.
      **Public API** (method input).
- [ ] Split the rest of `routes/entries.ts`: the contract cache to
      `entries/catalogue.ts`, access ordering to a shared `route-access.ts`.
- [ ] Paths: `DELETE /entries/:type/:id/force` contradicts "there is no
      force-delete"; `POST /media/upload` becomes `POST /media`. **Public
      API.**
- [x] The plugin RPC route looks a plugin up once; a missing handle answers 404.
      Done on `services`, where `/rpc/plugins.*` shares the handler.
- [ ] The CLI's per-domain commands share one set of `--config`/`--json`
      flags, the delete confirmation and the `try`/`printError` wrapper. The
      drift report pairs `entries-publish.ts` with `entries-unpublish.ts`,
      `entries-delete.ts` with `users-delete.ts`, and `generate-manifest.ts`
      with `generate-types.ts`.
- [ ] Guard: `tests/transport/policy-parity.test.ts` runs a policy matrix
      (publish without the permission, `status` on a type with statuses off,
      demoting the last admin, a draft read through plugin `ctx`, `staged` on
      a global without staging) through REST, RPC, tool dispatch, `callMethod`
      and plugin `ctx`, and asserts one outcome code per case.

Depends on `policy-in-the-service-layer.md` and `one-service-handle.md`.
