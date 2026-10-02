# Field labels name no control

An admin field's `<label>` is not tied to the control it labels.
`packages/admin/src/components/fields/field-wrapper.tsx` renders the label with
no `htmlFor`, and the controls carry no `aria-labelledby`, so a screen reader
announces an unnamed control and clicking the label does not focus it. Found in
stage 4 of [test-suite-review](../in-progress/test-suite-review.md): Testing
Library's `getByLabelText` and role-with-name queries cannot find a field, so
the admin tests find controls by `name` through `findFieldControl` in
`packages/admin/tests/_support/render-admin.tsx`.

## The work

- [ ] Give each field control an accessible name from its label: `htmlFor` and
      an `id` for a field with one control, `aria-labelledby` (or a
      `fieldset` and `legend`) for a field with several, such as the link
      field's three.
- [ ] Move the admin tests from `findFieldControl` to label queries, and delete
      the helper if nothing else needs it.
