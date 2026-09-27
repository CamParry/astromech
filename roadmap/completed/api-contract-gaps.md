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

What this work left open is in `planned/api-contract-follow-ups.md`.
