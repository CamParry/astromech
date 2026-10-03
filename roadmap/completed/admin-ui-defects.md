# Admin UI defects found by the stage 5 tests

Found by the admin component tests added in stage 5 of
[test-suite-review](../completed/test-suite-review.md). Each tested one is an
expected failure (`it.fails`) until fixed.

- [x] The command palette lists Media and Users to every user; the sidebar hides
      them without `media:read` or `users:read`. The palette's `navItems` in
      `packages/admin/src/components/ui/command-palette.tsx` are not filtered.
      Tested in `packages/admin/tests/components/ui/command-palette.test.tsx`.
- [x] The locale modal's proceed button shows the raw key `common.continue`:
      `packages/admin/src/components/entries/create-locale-modal.tsx` uses it
      and the English strings have no such key. Tested in
      `packages/admin/tests/components/entries/create-locale-modal.test.tsx`.
- [x] The locale modal's picker offers default-locale entries that already have
      the requested locale, and "Translate" on one sends an empty update over
      that locale's row. Same test file.
- [x] The notification bell's unread count is `aria-hidden` and the button's
      label is only "Notifications", so a screen reader never hears the count
      (not tested).
- [x] A clickable table row opens by mouse only: `Table.Row` in
      `packages/admin/src/components/ui/table.tsx` renders a `<tr data-href>`
      with an `onClick` and no link or focus, so a keyboard user cannot open
      the entry. Every clickable admin table is affected; the seo overview is
      where the tests found it.
- [x] The seo overview's Status column shows the raw value (`published`,
      `draft`) where the admin's own strings have "Published".
