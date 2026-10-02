# A media upload skips the field pipeline

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

## The work

- [ ] Run the field pipeline on upload in create mode, so defaults fill and a
      required field with no default is refused, as on the other resources.
      Decide whether an upload with no fields may skip `required` checks (a
      file dropped into the media library has nowhere to enter them).
- [ ] Turn the media row's expected failure into a passing case.
