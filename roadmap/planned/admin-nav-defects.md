# Admin navigation defects

Suspected on 2026-10-04 while planning `roadmap/planned/sidebar-groups.md`.
Neither is confirmed: write a failing test first.

- **Site entry types may show without a permission check.** The sidebar
  (`packages/admin/src/hooks/use-admin-nav.ts`) appears to list every site
  entry type, whether or not the user can read it.
- **A plugin's translated label may show its key.** A plugin nav label given as
  a `$t` key may render the key instead of the text.

## The work

- [ ] A test for each; fix those that fail.
- [ ] Check the command palette, which lists the same items.
