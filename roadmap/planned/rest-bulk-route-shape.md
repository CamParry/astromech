# REST shape for multi-id entry writes

Decide, then build, the REST shape for the multi-id entry operations. This file
holds the open question and the options; it does not change any route. The
service-layer shape (a single id is a batch of one) is settled in
`DECISIONS.md` and is not reopened
here.

## What ships today

`packages/astromech/src/transport/http/routes/http-routes.shared.ts` mounts seven
`POST /entries/:type/bulk-*` routes (`bulk-update`, `bulk-trash`, `bulk-delete`,
`bulk-restore`, `bulk-publish`, `bulk-unpublish`, `bulk-schedule`). Every one is a
`POST` with the ids in a JSON body key named `ids`. Single-id writes are separate
routes: `PUT /entries/:type/:id`, `DELETE /entries/:type/:id`,
`DELETE /entries/:type/:id/force`, `POST /entries/:type/:id/restore`.

Two things are out of step:

- `DECISIONS.md` records the multi-id write as `PATCH /entries/:type` with the ids in the
  body. The code ships `POST /entries/:type/bulk-update`. Either the route
  changes or a later decision supersedes that sentence.
- `cascadeLocales` is in the input contract for `bulk-trash` and `bulk-delete`
  (`packages/astromech/src/entries/methods.ts`), but the shared `bulkArgs` reader
  in `packages/astromech/src/transport/http/routes/entries.ts` never forwards it,
  so over REST a multi-id delete cannot cascade. Only the single-id `/force`
  route reads it, from the query string.

## The options

1. **Collection verbs, ids in the body.** `PATCH /entries/:type` and
   `DELETE /entries/:type` with `{ ids, … }`. Directus does this
   (`PATCH /items/:collection` with `{ keys, data }`, `DELETE /items/:collection`
   with a key array). It is what the batch decision wrote down. Cost: `DELETE` with a body is
   legal under RFC 9110 but has no defined semantics, and some proxies drop it.
2. **Custom methods as `POST`.** `POST /entries/:type:batchUpdate`,
   `:batchDelete`, per Google AIP-234 and AIP-235. Closest to what ships, minus
   the naming, and it never needs a `DELETE` body. Cost: reads as RPC.
3. **One batch endpoint.** `POST /entries/:type/batch` taking a list of
   `{ op, id, … }` items, per JSON:API atomic operations. Matches the
   heterogeneous primitive reserved for the edit grid. Cost: the largest
   change, and the per-op capability and permission checks move from the route
   table into the handler.

## The work

- [ ] Pick one of the three and record it as a decision. If it is not option 1,
      the record supersedes the one sentence in `DECISIONS.md` that names
      `PATCH /entries/:type`.
- [ ] Rename or restructure the seven routes to match. The generated client and
      OpenAPI document derive from the route table, so the table is the one edit;
      `packages/astromech/tests/transport/http/routes/entries-bulk.test.ts` is the
      safety net.
- [ ] Forward `cascadeLocales` from the body on the multi-id trash and delete
      routes, whichever shape wins.
- [ ] `apps/docs/` has no page on the multi-id routes. Add one once the shape is
      fixed, not before.

## Not changing

- The service contract in `packages/astromech/src/types/services.ts`: single id
  returns a row, an id array returns rows, both atomic (`DECISIONS.md`).
- The single-id routes. They stay whatever the multi-id shape becomes.
