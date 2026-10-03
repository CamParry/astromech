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
- **`uploadMedia` takes optional `data: { fields }` beside `file`**, written to
  the default-locale row. `data` follows the method-signature rule and leaves
  room for `alt` and `title`; over HTTP it is a JSON-encoded `data` form part. The admin's upload dialog shows the media fields only
  when a required one has no default, or when the server refuses fields the
  browser cannot check (a `validate` function). Unlike Payload's per-file
  form, one form covers the whole batch; a batch that fails partway keeps only
  the files not yet uploaded for the retry. Rejected:
  refusing, at config load, a required media field with no `defaultValue`.
- **Fields are validated before the file is stored**, so a refused upload leaves
  nothing in storage. The reverse of `media-delete-removes-files-first.md`:
  a file write ahead of a row write that can still fail.
- **`replace` leaves the fields untouched** and runs no pipeline.
- **First-run setup enforces `required` too.** Its screen collects the user
  fields when a required one has no default, as Payload's create-first-user
  form renders the user collection's fields.

## The work

- [x] `uploadMedia` runs the field pipeline in create mode on optional
      `data.fields`, before `storeFile`, and removes the stored file when the
      row write fails. The CLI and MCP cannot call `upload` (`binaryInput`);
      `astromech users:create` takes `--fields`.
- [x] The admin's upload dialog collects media fields when a required one has
      no default.
- [x] First-run setup (`auth/setup.ts`) runs the user field pipeline, through
      the same `createUserRows` write as `users.create`, and answers "closed"
      before it reads any field.
- [ ] Check the rest of the class and fix what fails: a new locale added to an
      existing entry, global, user or media item (an update to a locale with no
      content row, where `parse-fields.ts` fills no defaults), and a user created
      through Better Auth sign-up rather than `users.create`. Checked
      2026-10-03: Better Auth sign-up is refused outright
      (`databaseHooks.user.create.before`); media and users start a new locale
      from the default-locale row's fields; the redirects plugin parses as a
      create. Left: entries and globals adding a locale, and plugins that store
      files before a row write.

## Found along the way

- The admin's media detail modal edits only alt, title and caption, so custom
  media fields cannot be edited anywhere in the admin after upload.
- `astromech/ui`'s `Textarea`, `NumberField` and `Combobox` render their
  `error` as a bare paragraph with no `aria-describedby`; `Input` is fixed.
- The new-user page shows a server 422 naming `email` only as a toast with the
  raw key, as setup did before this work.
- There is no CLI path to upload media before a first user exists, so a
  required media user field needs a `defaultValue`.
- [x] Turn the media row's expected failure into a passing case.
