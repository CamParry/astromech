# REST shape for multi-id entry writes

Decide the REST shape for the multi-id entry writes. The service-layer shape (a
single id is a batch of one) was settled separately and was not reopened.

## Outcome

The shipped routes stay: seven `POST /entries/:type/bulk-<action>` routes in
`packages/astromech/src/transport/http/routes/http-routes.shared.ts`, each
taking the ids as `ids` in the JSON body. `DECISIONS.md` records why, under
"Multi-id writes over REST are `POST` action routes", against the three options
this file weighed: collection verbs (Directus), custom `POST` methods (Google
AIP-136 and AIP-235), and one batch endpoint (JSON:API atomic operations).

## The work

- [x] Pick one of the three and record it as a decision. Custom `POST` methods,
      in the path-segment form that already shipped. The sentence this file
      expected to supersede, naming `PATCH /entries/:type`, had already left
      `DECISIONS.md`.
- [x] Rename or restructure the seven routes to match. Nothing to rename.
- [x] Forward `cascadeLocales` on the multi-id trash and delete routes. Moot:
      trashing and deleting now act on every locale of an entry, and the option
      is gone from the service.
- [x] Document the multi-id routes. The OpenAPI document at
      `<basePath>/api/openapi.json` is generated from the route table and lists
      all seven, and
      `packages/astromech/tests/transport/http/routes/openapi-document.test.ts`
      fails if a row goes missing from it. `apps/docs/` holds guides and has no
      REST pages, so a page for these seven alone was not added.
