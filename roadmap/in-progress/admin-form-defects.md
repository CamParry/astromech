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
- [x] **A `group()` field submits only its touched sub-key, destroying its
      siblings.** Closed 2026-08-15 as unreproducible after a third round; see
      the last sub-bullet. Observed end-to-end on 2026-08-03: a Post's `seo` group held
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
    - **Also not reproduced in the browser, on the reported shape.** Verified
      2026-08-06 against the demo: a Post's `seo` group seeded with
      `{title, description}`, Meta title edited alone, the `PUT` intercepted. The
      request carried the **whole** group, and `description` was intact in storage
      after. This is stronger evidence than the render tests, because a partial
      group cannot be rescued downstream — a group's object value is atomic, so an
      absent sibling on the wire would be an absent sibling in the row.
    - What is left to try is a run that varies what the render harness and the
      browser check could not: a locale switch through `LocaleSwitcher`, which
      navigates to a different entry id while `useForm` keeps the same `FormApi`;
      the assistant plugin writing the entry mid-session; and the `seo-preview`
      plugin field's `React.lazy` boundary, which the harness cannot exercise
      without `virtual:astromech/plugins/components`. Subscribe to `form.store`
      and log every `values.fields` transition with a stack trace.
    - If none of those show it, close this as unreproducible rather than leaving
      it open indefinitely. Two rounds have now failed to find a mechanism, and
      the two candidate explanations above are both consistent with the symptom
      having been fixed already.
    - **2026-08-15 — third round ran all three, none showed it; closed as
      unreproducible.** The two candidate explanations above (the `key-value`
      defect misattributed, or form state already corrupted by the `href`/`url`
      bug `cccf47d` fixed the same day) are what stands.
        - **Locale switch**, in the real-`EntryEditPage` router harness, with a
          subscription to the page's own `form.store` recording every distinct
          `values.fields`: edit `seo.title` alone → navigate to the sibling
          locale's id → edit there → navigate back → edit → save. Every
          transition carried both sub-keys and the `PUT` payload did too. Kept
          as `tests/admin/components/entries/entry-edit-locale-switch.test.tsx`.
        - **An external write landing mid-session**, same harness: the server row
          replaced behind the author's back and `invalidateQueries` run, both
          while an edit was in flight and after a save had cleared `isTouched`.
          The group survived both saves. Throwaway — no new mechanism to pin.
        - **The plugin field's `React.lazy` boundary IS exercisable in the
          harness**, contrary to the note above: `virtual:astromech/plugins/components`
          is a vitest alias to `tests/_support/plugins-components-shim.ts`, so a
          test `vi.mock`s it with a `fieldTypes` entry whose `load` resolves on
          command. A group holding a `seo-preview`-shaped lazy field, edited
          while suspended and again after it landed, kept both sub-keys.
          Throwaway — `seo-preview` writes nothing, so it has no path to a group
          value at all.
- [x] **A locale switch mid-edit shows the previous locale's values.** Found by
      the probe above on 2026-08-15, fixed the same day. `LocaleSwitcher`
      navigates to a sibling entry id on the same route, so the route component
      was not remounted and `useEntryForm` kept one `FormApi`; `defaultValues`
      swapped to the new row, but `@tanstack/react-form` only copies them while
      `isTouched` is false — after any edit the other locale's form showed the
      first one's values, and a save there would have written them into the
      sibling row.
    - The fix: `EntryEditPage` renders its body keyed by the entry id, so any
      same-route id change (locale switch, stage/discard, duplicate) remounts
      the whole form. A `form.reset` on id change was rejected because the
      stateful field containers (`repeater-field.tsx`, `key-value-editor.tsx`,
      `use-blocks-field.ts`, `use-tree-field.ts`) seed local state once and
      deliberately never resync, so only a remount reaches them.
    - Both cases are pinned in `entry-edit-locale-switch.test.tsx`: untouched
      (the copy lands) and touched (edit → switch shows the sibling's own
      values, switch back discards the unsaved edit).
- [x] **`repeater` seeds `useState` with no re-seed guard.** Closed by `cccf47d`;
      the guard is at `repeater-field.tsx:270-273`.
- [x] **`key-value` loses stored pairs.** Fixed 2026-08-06. Real and
      data-destroying, but not in `key-value-field.tsx`, which is stateless and
      passes the whole record through. The defect was one layer down at
      `admin/components/ui/key-value-editor.tsx:41`, whose `useState` initializer
      seeded from the prop with no re-seed guard — the last unguarded stateful
      container. An entry storing `{alpha, beta}` rendered zero pair rows, and
      adding a pair committed `{gamma: ''}`, destroying both.
    - The root fact under this and the three already-guarded containers:
      `useEntryForm` is constructed with `fields: {}` while the entry is fetching,
      and `@tanstack/react-form`'s `useForm` runs `FormApi.update` in a layout
      effect with no dependency array. Layout effects run child-before-parent, so
      **the field tree's first render always sees `fields = {}`**. One fact, one
      remaining victim — not one root cause with three fixes.
    - The guard is the same one `use-blocks-field.ts`, `use-tree-field.ts` and
      `repeater-field.tsx` carry: seed once when real data arrives, never resync
      after, or an in-progress edit is clobbered by the last-saved value.
- [ ] **`tabs()` takes no name and hardcodes one.** Every other factory is
      `type(name, options?)`; `fields/builder.ts:215-217` is
      `tabs(options)` returning `{ name: 'tabs', … }`. Two `tabs()` in one entry
      type therefore produce two fields both named `tabs` — harmless while a
      layout field's name is inert, and a duplicate-key bug the moment anything
      keys off it. Don't fix it in isolation: it is the accidental prototype for
      `roadmap/planned/named-layout-fields.md`, which decides what a layout
      field's name means.
- [ ] **`json` renders empty for a stored value, then commits `null` over it.**
      Found 2026-08-16 extending the field coverage below; the same class as the
      `key-value` defect and the last unguarded one. `json-field.tsx:11` seeds
      `useState(initialJson)` from `value` on the first render — where `value` is
      still `undefined` — and never re-seeds. An entry storing `{alpha: 1}` shows
      an empty textarea, and `handleBlur` reads `raw.trim() === ''` and commits
      `onChange(name, null)`, so focusing the field and leaving it destroys the
      stored object.
    - Verified against the real `EntryEditPage` with a cold query cache, not just
      the field harness: the textarea is empty there too.
    - Pinned as two `it.fails` cases in
      `packages/astromech/tests/admin/components/fields/stateful-field-seeding.test.tsx`.
      Delete the `.fails` when the guard lands.
- [ ] **`richtext` renders empty for a stored document.** Found the same way and
      the same shape, one layer down in the editor.
      `admin/components/ui/rich-text-editor.tsx:311` passes `content` into
      `useEditor`, and TipTap reads `content` once when it builds the editor —
      `setOptions` pushes the other options on later renders but never replaces
      the document. The first render carries `content: undefined`, so the stored
      prose never appears.
    - Also verified against the real `EntryEditPage` with a cold cache.
    - Unlike `json` it destroys nothing on its own: the editor only commits from
      `onUpdate`, so an untouched field writes nothing back.
    - Pinned as an `it.fails` case in the same file.
- [x] Extend render-level coverage to the **field** components. Two files now
      exist to copy from, and they are different tools:
      `tests/admin/components/entries/entry-form-field-seeding.test.tsx` renders a
      field tree directly — it pins the `{}`-first-render fact, covers the
      `key-value` regression, and holds a group-keeps-its-sibling case.
      `tests/admin/components/entries/entry-edit-cache-invalidation.test.tsx`
      mounts the **real `EntryEditPage`** behind a memory router plus the provider
      stack, which is what makes it fail when the page itself regresses. Reach for
      the second shape whenever the thing under test is page-level wiring rather
      than a component's own behaviour — a test that rebuilds the wiring it means
      to protect cannot fail when that wiring is removed.
    - Done 2026-08-16. Every registered field type now has render-level
      coverage, and `tests/admin/hooks/container-field-seeding.test.tsx` uses
      testing-library instead of a hand-rolled React root. The new files, all
      under `packages/astromech/tests/admin/components/fields/`:
        - `leaf-field-controls.test.tsx` — the controlled leaves (`text`,
          `textarea`, `email`, `url`, `slug`, `date`, `datetime`, `number`,
          `boolean`, `select`, `multiselect`, `checkbox-group`, `radio-group`,
          `range`, `color`). Each: the stored value renders, a late value renders
          on its own, and a change commits under the bare field name.
        - `stateful-field-seeding.test.tsx` — `blocks` and `tree` at the
          component level (seed late, no resync, siblings survive an edit), plus
          the `json` and `richtext` defects above.
        - `reference-field-loading.test.tsx` — `media` and `relationship`, the
          two that fetch what the stored id points at. Both answer the seeding
          fact without the containers' guard, and neither writes over the stored
          id when its lookup fails.
        - `plugin-field-loading.test.tsx` — the `React.lazy` path: the spinner,
          a value arriving either side of the module, the registration's
          `defaultValue`, and its `validate` message.
    - `color`'s change path is display-only: `react-colorful` is driven by
      pointer drags on a gradient that has no layout under happy-dom.
