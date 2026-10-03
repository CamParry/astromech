# A create skips the field pipeline

`uploadMedia` (`packages/astromech/src/media/methods/upload.ts`) stores
`fields: {}` without running the field pipeline, and
`packages/astromech/src/fields/parse-fields.ts` fills defaults only when the
operation is `create`. So a media field's configured `defaultValue` never
applies on upload, and neither do the built-in type defaults (`false` for a
checkbox, `[]` for a repeater). Entries, globals and users fill them. Found by
the conformance tables in stage 4 of
[test-suite-review](../completed/test-suite-review.md):
`packages/astromech/tests/content/resource-field-validation.test.ts` marks the
media row as an expected failure until this is fixed.

First-run setup has the same defect: `packages/astromech/src/auth/setup.ts`
writes the first admin's content row as `{ fields: {} }`, so user-field
defaults never apply to that user. The class is a content row written without
the field pipeline.

## Prior art

Payload runs the full create pipeline on upload: defaults fill and a missing
required field is refused. Its bulk upload gives each file a form and keeps a
file that fails, with its error. Directus creates a file without its required
fields only because its API never checks them (the check is in the admin form
alone). Strapi has no custom media fields.

## Decided (2026-10-02)

- **`required` is enforced on upload**, as on every other resource.
- **`uploadMedia` takes optional `fields` beside `file`**, written to the
  default-locale row. The admin's upload dialog shows the media fields only
  when a required one has no default, as Payload's per-file form does. Rejected:
  refusing, at config load, a required media field with no `defaultValue`.
- **Fields are validated before the file is stored**, so a refused upload leaves
  nothing in storage. The reverse of `media-delete-removes-files-first.md`:
  a file write ahead of a row write that can still fail.
- **`replace` leaves the fields untouched** and runs no pipeline.

## The work

- [ ] `uploadMedia` runs the field pipeline in create mode on optional `fields`,
      before `storeFile`. The CLI and MCP get the same argument from the method's
      input schema.
- [ ] The admin's upload dialog collects media fields when a required one has
      no default.
- [ ] First-run setup (`auth/setup.ts`) runs the user field pipeline.
- [ ] Check the rest of the class and fix what fails: a new locale added to an
      existing entry, global, user or media item (an update to a locale with no
      content row, where `parse-fields.ts` fills no defaults), and a user created
      through Better Auth sign-up rather than `users.create`.
- [ ] Turn the media row's expected failure into a passing case.
