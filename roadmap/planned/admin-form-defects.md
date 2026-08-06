# Admin form defects

Bugs in the entry-form field components, found browser-verifying the P4b patch
merge on 2026-08-03. All predate the patch-merge change and are unaffected by it.

**Three of the six entries here were wrong when this file was written.** The
`link` and `repeater` defects had already been fixed the same day by `cccf47d`,
which this file's own "re-checked" claim missed; the `key-value` defect is real
but was attributed to the wrong file; and the `group` defect did not reproduce.
Each is recorded below rather than deleted, because the observation that produced
it was real and the misattribution is the useful part.

- [x] **`link` field writes `href`; its validator requires `url`.** Closed by
      `cccf47d`. `url` is canonical: `link-field.tsx` holds
      `type LinkValue = { url; label; target }` and its `handleChange` spreads the
      stored value first, so keys it does not edit survive.
      `fields/built-in-rules.ts`'s `validateLink` and `fields/core-field-types.ts`
      agree, and `apps/demo/seed.ts` seeds `url`.
    - The descriptor's `tsType` is read only by `codegen/type-generator.ts` for the
      authoring-time `.d.ts`. It never reaches storage or the read shape, so the
      key name is a validation and generated-type contract, nothing serialized.
    - **The rich-text link mark is independent and uses `href`**, matching HTML and
      TipTap (`fields/rich-text/safe-links.ts`). It shares no code or types with
      the `link` field. There is nothing to reconcile between them.
- [ ] **A `group()` field submits only its touched sub-key, destroying its
      siblings.** Observed end-to-end on 2026-08-03: a Post's `seo` group held
      `{title, description}`; editing only Meta title sent
      `fields.seo = {"title": "…"}` and `description` was gone after the save.
    - **Not reproduced at render level, and the hypothesis in the original entry
      is disproven.** That hypothesis was a TanStack `defaultValues` copy blocked
      by an earlier write. In every composition tried, `form.state.isTouched` was
      `false` when `FormApi.update` ran, so the `!isTouched` gate never blocked the
      copy and no pre-seed writer exists.
    - Ruled out by real render plus `user-event` interaction: a minimal group; the
      demo Post's whole main column; the demo's exact `seoSection()` shape
      including an unregistered third field type; two `<form.Field name="fields">`
      columns as `entry-edit-page.tsx` has; a group inside a non-initial tab opened
      by click; a background refetch landing after an edit; and
      edit → save → refetch → edit, which is the `form.reset(form.state.values)`
      path that clears `isTouched`. Two stale-closure theories were killed too:
      TipTap keeps options in a ref, and `FieldApi` derives from the form store, so
      two `form.Field`s on one name cannot diverge.
    - `group` holds no state, which is why it is immune to the seeding fact below.
    - Two candidate explanations for the original observation, both untested: it
      was the `key-value` defect misattributed, or it was form state already
      corrupted by the `href`/`url` bug that `cccf47d` fixed the same day.
    - **What to try next is a browser run, not more static tracing**: on the demo,
      subscribe to `form.store` and log every `values.fields` transition with a
      stack trace. Watch a locale switch through `LocaleSwitcher`, which navigates
      to a different entry id while `useForm` keeps the same `FormApi`; the
      assistant plugin writing the entry mid-session; and the `seo-preview` plugin
      field's `React.lazy` boundary, which the test harness cannot exercise without
      `virtual:astromech/plugins/components`.
- [x] **`repeater` seeds `useState` with no re-seed guard.** Closed by `cccf47d`;
      the guard is at `repeater-field.tsx:270-273`.
- [ ] **`key-value` loses stored pairs.** Real and data-destroying, but not in
      `key-value-field.tsx`, which is stateless and passes the whole record
      through. The defect is one layer down at
      `admin/components/ui/key-value-editor.tsx:41` — `useState(() =>
    recordToPairs(value))` with no re-seed guard, the last unguarded stateful
      container. An entry storing `{alpha, beta}` renders zero pair rows, and
      adding a pair commits `{gamma: ''}`, destroying both.
    - The root fact under this and the three already-guarded containers:
      `useEntryForm` is constructed with `fields: {}` while the entry is fetching,
      and `@tanstack/react-form`'s `useForm` runs `FormApi.update` in a layout
      effect with no dependency array. Layout effects run child-before-parent, so
      **the field tree's first render always sees `fields = {}`**. One fact, one
      remaining victim — not one root cause with three fixes.
- [ ] **`tabs()` takes no name and hardcodes one.** Every other factory is
      `type(name, options?)`; `fields/builder.ts:215-217` is
      `tabs(options)` returning `{ name: 'tabs', … }`. Two `tabs()` in one entry
      type therefore produce two fields both named `tabs` — harmless while a
      layout field's name is inert, and a duplicate-key bug the moment anything
      keys off it. Don't fix it in isolation: it is the accidental prototype for
      `roadmap/planned/named-layout-fields.md`, which decides what a layout
      field's name means.
- [ ] Extend render-level coverage to the **field** components.
      `tests/admin/components/entries/entry-form-field-seeding.test.tsx` is the
      start: it pins the `{}`-first-render fact, covers the `key-value` regression,
      and holds a group-keeps-its-sibling case. `@testing-library/react` and
      `user-event` are in and the media surface is covered, but the rest of the
      field components are not, and
      `tests/admin/hooks/container-field-seeding.test.tsx` still hand-rolls a React
      root that testing-library could now replace.
