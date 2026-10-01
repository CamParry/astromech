# Entry hook and error contract gaps

Found while building the API contract follow-ups (2026-09-27).

- [ ] **A bulk update that sets `slug` answers 500.** `updateEntryBatch` throws a
      plain `Error` for `slug` with more than one id, which `onError` answers as
      an unexpected failure. It is the caller's mistake: answer a 422 naming
      `slug`.
- [ ] **Some routes are not in the OpenAPI document.** `GET /entry-types`,
      `GET /entry-types/:type`, `POST /rpc/:id`, `POST /setup`,
      `GET /setup/check`, the cron routes, the multipart `POST /media` and
      `POST /media/:id/replace`, and Better Auth's `/auth/*` are served but not
      documented. Decide which belong in the document.
