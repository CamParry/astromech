# Entry hook and error contract gaps

Found while building the API contract follow-ups (2026-09-27).

- [ ] **An entry before-hook's return is ignored.** `runHook` resolves to the
      payload a handler returns, and `globals.update` writes the returned
      `data`, but `entries.create` and `updateEntryBatch` in
      `packages/astromech/src/entries/internal/update-batch.ts` discard what
      `entry:beforeCreate` and `entry:beforeUpdate` resolve to. Only a handler
      that changes the `data` object in place changes the write. Honour the returned payload,
      or document assignment as the entry hooks' contract and say why the two
      resources differ.
- [ ] **`entry:beforeCreate`'s row is written unparsed.** `entries.create` and a
      translation's `planTranslation` parse the caller's data before the hook,
      then write the row the hook may have changed with no second parse. Parse
      it as `parseHookOutput` does for updates, or state why a create row is
      trusted.
- [ ] **A bulk update that sets `slug` answers 500.** `updateEntryBatch` throws a
      plain `Error` for `slug` with more than one id, which `onError` answers as
      an unexpected failure. It is the caller's mistake: answer a 422 naming
      `slug`.
- [ ] **Some routes are not in the OpenAPI document.** `GET /entry-types`,
      `GET /entry-types/:type`, `POST /rpc/:id`, `POST /setup`,
      `GET /setup/check`, the cron routes, the multipart `POST /media` and
      `POST /media/:id/replace`, and Better Auth's `/auth/*` are served but not
      documented. Decide which belong in the document.
