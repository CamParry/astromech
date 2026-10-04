# Admin navigation defects

Suspected on 2026-10-04 while planning `roadmap/planned/sidebar-groups.md`. Not
confirmed: write a failing test first.

- **A plugin's translated label may show its key.** A plugin nav label given as
  a `$t` key may render the key instead of the text.

The sidebar listing site entry types without a read check is already a fix in
`roadmap/planned/permissions.md`.

## The work

- [ ] A test for the label, in the sidebar and the command palette; fix it if
      it fails.
