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
  `bind()`, validates the result. `query-string.ts` is the one encoding both
  halves use: `sort`/`dir` and `where[field]`, so no list route needs a
  schema of its own. `attachHandlers` and the handler half of a row (`args`,
  `query`, `body`, `precondition`) go; `notFound` moves onto the row.
- Access ordering (permission, then the target's existence) is one function
  in `route-access.ts`, read by the table mount and the bespoke cross-type
  query. It resolves the method's `access` against the URL's arguments, so
  `GET /globals/:key` (a public global's plain read) becomes a table row.
- Bulk entry methods take `id` (one) or `ids` (a list), as Payload's Local API
  takes `id` or `where` on one method. `fromBatch` reads `ids`; the table's
  `wireNames` and `fromZodError`'s rename go.
- `DELETE /entries/:type/:id` calls `entries.delete`, and
  `POST /entries/:type/:id/trash` calls `entries.trash`, beside
  `/:id/restore`. The bespoke trash-or-delete handler and `/:id/force` go.
  `POST /media/upload` becomes `POST /media`.
- CLI: shared flags (`configArgs`, `jsonArgs`), one confirmation prompt, and
  one wrapper (`withApplication`) that boots, runs and reports errors.
- `tests/transport/policy-parity.test.ts`: each case lists the transports it
  applies to and the one outcome they must all give.

## The work

- [x] `mountRestRoutes` builds args from path params, `queryArgs` and the body,
      parsed by the method's input schema; delete the per-router helpers.
      Left bespoke, each with its reason above the handler: the cross-type
      `POST /entries/query`, `GET` and `PUT /users/:id` (self-access), the two
      multipart media routes and `GET /notifications/count`.
- [x] Bulk methods take `ids` and `wireNames` goes, matching the `code` skill.
      **Public API** (method input).
- [x] Split the rest of `routes/entries.ts`: the contract cache to
      `entries/catalogue.ts`, access ordering to a shared `route-access.ts`.
      The cache was already `entryCatalogue`; with the argument helpers gone
      the file is about 100 lines.
- [x] Paths: `DELETE /entries/:type/:id/force` contradicts "there is no
      force-delete"; `POST /media/upload` becomes `POST /media`. **Public
      API.** `DELETE /entries/:type/:id` deletes and
      `POST /entries/:type/:id/trash` trashes.
- [x] The plugin RPC route looks a plugin up once; a missing handle answers 404.
      Done on `services`, where `/rpc/plugins.*` shares the handler.
- [x] The CLI's per-domain commands share one set of `--config`/`--json`
      flags, the delete confirmation and the `try`/`printError` wrapper. The
      drift report pairs `entries-publish.ts` with `entries-unpublish.ts`,
      `entries-delete.ts` with `users-delete.ts`, and `generate-manifest.ts`
      with `generate-types.ts`. Publish and unpublish are one factory,
      `entries-status.ts`.
- [x] Guard: `tests/transport/policy-parity.test.ts` runs a policy matrix
      (publish without the permission, `status` on a type with statuses off,
      demoting the last admin, a draft read through plugin `ctx`, `staged` on
      a global without staging) through REST, RPC, tool dispatch, `callMethod`
      and plugin `ctx`, and asserts one outcome code per case. The staged
      case found `globals.get` answering null where REST answered 409.

Depends on `policy-in-the-service-layer.md` and `one-service-handle.md`.
