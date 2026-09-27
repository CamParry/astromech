# API contract gaps

Found while building `completed/output-schemas.md` (2026-09-26). Each item is a
place where the API's documented or checked contract says less than the
server does.

- [x] **Every documented route lists its error statuses**, derived from its row
      and method by `errorResponses`, with a 422 as the `ValidationError` component.
- [x] **`/me` is documented and parsed** through `meSchema` (the public `User`
      and a `Role`), and the admin reads its type from core.
- [x] **Entry methods in the method manifest emit `output`**, from the runtime
      methods' output schemas the per-type catalogue already carries.
- [x] **Plugin service methods are in the OpenAPI document**, one path each,
      generated apart and merged in when `/openapi.json` is served.
- [x] **Unknown input keys are refused.** Every core and first-party plugin
      method input is a `z.strictObject`, so an unknown key answers 422 naming
      it, and a `GET` or `DELETE` ignores query params its method does not declare.
- [x] **The version tables' unused `status` column is dropped.** A version
      holds content, not publication state (`DECISIONS.md`).

## Found while building

- [ ] **The entry method inputs exist twice.** Each method's runtime schema in
      `packages/astromech/src/entries/methods/` has a per-type copy in
      `packages/astromech/src/entries/catalogue.ts`, which the method manifest
      and the OpenAPI document read. Derive the per-type catalogue from the
      runtime schemas, so the two cannot disagree.
- [ ] **A hook's extra key answers the caller's 422.** A `global:beforeUpdate`
      hook that returns `data` with a key the input does not declare now fails
      the re-parse in `packages/astromech/src/globals/methods/update.ts`, so
      the caller gets a 422 for the hook's mistake. No first-party hook does
      this. Decide whether a hook's output failing the parse is a 500 naming
      the hook.
- [ ] **Some error statuses are still undocumented.** `DELETE /users/:id` answers
      400 (`LastAdminError`) with no 400 documented; a route addressing a missing
      entry type, global or `:id` answers 404 where only a row's `notFound` is
      documented; and a method's 409 (`capability_not_supported`, a staged change
      that exists) is not documented anywhere.
- [ ] **The cross-type query's 400 has no `id`.** `POST /entries/query` answers a
      missing `type` with a hand-written `invalid_input` body, which the
      documented `Error` component does not describe.
- [ ] **Redocly warns on every operation.** `redocly lint --extends=minimal`
      passes the document but warns that no operation has an `operationId`, and
      that each nullable union's `{ nullable: true }` branch has no `type`
      (`nullableAsUnion` in
      `packages/astromech/src/transport/http/routes/rest-route.ts`). Client
      generators name methods from `operationId`, so the method id is the
      obvious source.
