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
