# REST handlers derived from the route table

Once no route carries policy, a REST handler is fully derived from its row in
the route table, and a test holds every transport to the same answer.

## Why

- Each router hand-writes argument extraction (`param`, `flag`,
  `contentArgs`, `keyArgs`, `listArgs`, `getArgs`, `queryArgs`) in
  `routes/entries.ts`, `routes/globals.ts`, `routes/users.ts` and
  `routes/media.ts`, and `full` is parsed two ways.
- `routes/entries.ts` holds query-string parsing, access ordering and bespoke
  routes; `routes/globals.ts` holds a second copy of the access ordering.
- `rpc-parity.test.ts` and `mcp/parity.test.ts` check that a method is
  reachable, not that it answers the same; neither would have caught the
  publish bypass.

Checked against the code on 2026-09-23: `routes/entries.ts` is 397 lines, not
600, and the contract cache is already `entryCatalogue` in
`entries/catalogue.ts`; the drift report finds nothing on an empty branch, so
the CLI pairs below come from reading the commands.

## The plan

- `mountRestRoutes` builds each table route's argument object: path params,
  then the query string (every param on a `GET` or `DELETE`, the row's
  `queryArgs` on a `POST` or `PUT`), then the JSON body (under `bodyKey` when
  the row names one). A query-string value is converted to the boolean or
  number the method's input field declares; the method's own parse, in
  `bind()`, validates the result. The three list routes keep a `query`
  schema, which turns `sort` and `dir` into the method's `sort` object (and
  media's `mimeType` into `where`). `attachHandlers`, `RestHandlers.args`,
  `body` and `precondition` go; `notFound` moves onto the row.
- Access ordering (permission, then the target's existence) is one function
  in `route-access.ts`, read by the table mount and the bespoke entries and
  users routes. It resolves the method's `access` against the path and query
  arguments, so `GET /globals/:key` (a public global's plain read) becomes a
  table row. The entries and globals mounts pass the lookup whose miss
  answers 404.
- Bulk entry methods take `id` (one) or `ids` (a list), as Payload's Local API
  takes `id` or `where` on one method. `fromBatch` reads `ids`; the table's
  `wireNames` and `fromZodError`'s rename go.
- `DELETE /entries/:type/:id` calls `entries.delete`, and
  `POST /entries/:type/:id/trash` calls `entries.trash`, beside
  `/:id/restore`. The bespoke trash-or-delete handler and `/:id/force` go.
  `POST /media/upload` becomes `POST /media`.
- CLI: one set of shared flags (`--config`, `--json`, `--allow-remote`), one
  confirmation prompt for the two deletes, and one wrapper that boots, runs
  and reports errors, used by every command that calls a method.
- `tests/transport/policy-parity.test.ts`: each case lists the transports it
  applies to and the one error code (or result) they must all give.

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
