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

- [x] Write a failing test that every permission a manifest method requires
      appears in the catalogue, for every resource in the test config.
- [x] Derive the catalogue's action availability from the methods' `requires`,
      and drop the hand-kept gates.
- [x] Rewrite the two catalogue tests to assert the corrected behaviour.
- [x] Check the other resource catalogues (media, users, plugins) for the same
      restatement.

## Outcome

The catalogue now lists each entry or global action whose permission the
resource's available methods demand, and moved to
`packages/astromech/src/policies/permission-catalogue.ts`, because `permissions/`
sits below the content modules it now reads. One capability check,
`declaresCapability` in `packages/astromech/src/content/capabilities.ts`, serves
the runtime guard, the method manifest and the catalogue. Publish now follows
`statuses` (or `staging`, through `mergeStaged`), so a versioned type with
statuses and staging off, and a global with `statuses: false`, no longer list it.

`CORE_PERMISSIONS` stays hand-kept: it holds labels and two permissions no
method declares statically (`admin:access`, `entry:read:full`), and the new
cross-check fails if a media or users method demands one it does not list. Two
restatements of the same kind remain, in `roadmap/backlog.md`: plugin methods
whose permission the plugin never declares, and the admin's capability gates.
