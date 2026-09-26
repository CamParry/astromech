# API contract gaps

Found while building `completed/output-schemas.md` (2026-09-26). Each item is a
place where the API's documented or checked contract says less than the
server does.

- [ ] **Document the other error statuses.** Routes document their success body
      and, where a row has `notFound`, a 404 with the shared `Error` component.
      401, 403, 422 and 500 are not documented.
- [ ] **Document `/me`.** It is served in
      `packages/astromech/src/transport/http/app.ts`, outside the route tables,
      so it has no response schema.
- [ ] **Entry methods in the method manifest emit no `output`.**
      `projectEntryMethod` in
      `packages/astromech/src/codegen/method-manifest.ts` projects the input
      only.
- [ ] **Plugin routes are not in the OpenAPI document.** `/api/plugins/*` is a
      plain Hono router. Declaring `output` on a plugin method types and parses
      its result but does not document it over HTTP.
- [ ] **Unknown input keys are dropped without an error.** Input schemas strip
      unknown keys, so `PUT /entries/:type/:id` with the payload wrapped in
      `{ data: … }` answers 200 and changes nothing. Decide whether method
      inputs refuse unknown keys (`z.strictObject`), and where that would
      break a caller.
- [ ] **The entry and global version tables have a `status` column nothing
      writes.** It is always null, so a version's `snapshot` leaves it out.
      Either version `status` (add it to the spec's `versionedColumns`) or drop
      the column, which needs a migration and a hand edit to the Cloudflare
      baseline.
