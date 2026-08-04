# Admin form defects

Live bugs in the entry-form field components, found browser-verifying the P4b
patch merge on 2026-08-03 and re-checked when the documentation pass split them
out of `roadmap/backlog.md`. All predate the patch-merge change and are
unaffected by it — verified against the payload on the wire and against
`996ce11^`.

Two of them stop a save completing at all, so the admin is substantially broken
for the shapes they touch. The `form.state` and seeding lessons are in the `ui`
skill; these are the outstanding fixes.

- [ ] **`link` field writes `href`; its validator requires `url`.**
      `link-field.tsx:12-22` rebuilds the value from `href`/`label`/`target`
      only, discarding every other key, while `fields/built-in-rules.ts:210-216`
      and the descriptor (`core-descriptors.ts:418`) both require a `url` key.
      `descriptor.validate` runs at every stage on any non-empty value, so
      **every Page save in the demo fails client-side validation** ("A link needs
      a url") with the URL visibly populated. `apps/demo/seed.ts:746-750` seeds
      `href` too. Wrong shape, not a wrong path — decide which key is canonical,
      then fix the component, the seed and the rule together. Nothing is
      deployed, so no data migration is needed.
- [ ] **A `group()` field submits only its touched sub-key, destroying its
      siblings.** Reproduced end-to-end: a Post's `seo` group held
      `{title, description}`; editing only Meta title sent
      `fields.seo = {"title": "…"}` and `description` was gone after the save.
      Every `group()`-composed field is exposed, not just SEO. `group-field.tsx:16`
      is textually correct and holds no local state, so
      `form.state.values.fields.seo` was already partial at keystroke time — the
      suspected mechanism is the TanStack `defaultValues` layout-effect copy being
      blocked by an earlier write (`FormApi` gates it on `!isTouched`), the same
      shape as the fixed `useBlocksField`/`useTreeField` seeding bug. **The
      pre-seed writer was not identified by reading alone — this one needs a
      runtime diagnosis, not more static tracing.** A partial group is not
      something the update merge can rescue: a group's object value is atomic by
      design, exactly like an array.
- [ ] **`repeater` seeds `useState` with no re-seed guard**
      (`repeater-field.tsx:261-263`) — the guard `use-blocks-field.ts:43-47` and
      `use-tree-field.ts:119-123` already got. Latent today, same class as the bug
      above.
- [ ] **`key-value` rebuilds its value from the prop** like `group`
      (`key-value-field.tsx:7-15`) — same exposure if the seed race is confirmed.
- [ ] Extend render-level coverage to the **field** components.
      `@testing-library/react` and `user-event` are in and the media surface is
      covered, but the field components that motivated this are not: the
      `useBlocksField`/`useTreeField` seeding bug survived precisely because
      nothing renders a hook in the suite, and
      `tests/admin/hooks/container-field-seeding.test.tsx` still hand-rolls a
      React root that testing-library could now replace. The `group()` and
      `repeater` defects above are the obvious first targets.
