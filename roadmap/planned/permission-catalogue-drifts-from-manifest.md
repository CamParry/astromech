# Permission catalogue drifts from the method manifest

The permission catalogue (`packages/astromech/src/permissions/catalogue.ts`)
decides for itself which actions an entry type or global supports, instead of
reading the `requires` each method declares. The two already disagree.

## The defect

The catalogue offers `publish` only for a versioned type (`ENTRY_ACTIONS` and
`GLOBAL_ACTIONS`, `requires: 'versioning'`). The publish, unpublish and
schedule methods require `statuses`, not versioning
(`packages/astromech/src/entries/methods/publish.ts`,
`packages/astromech/src/globals/methods/publish.ts`). Entry types have statuses
on and versioning off by default, so for a default entry type the method needs
`entry:<type>:publish` while `astromech permissions` never lists it. Globals
version by default, so only a global with `versioning: false` is affected.

Two tests lock the wrong side in:
`packages/astromech/tests/permissions/permissions.test.ts` ("omits publish for
a type without versioning", "omits publish for a global without versioning").
`packages/astromech/tests/codegen/method-manifest.test.ts` asserts the method
side correctly.

## The class

Any list that restates which methods a resource exposes can drift from the
manifest the same way. The fix removes the second source rather than syncing it.

## The work

- [ ] Write a failing test that every permission a manifest method requires
      appears in the catalogue, for every resource in the test config.
- [ ] Derive the catalogue's action availability from the methods' `requires`,
      and drop the hand-kept gates.
- [ ] Rewrite the two catalogue tests to assert the corrected behaviour.
- [ ] Check the other resource catalogues (media, users, plugins) for the same
      restatement.
