# Client-Side Field Validation — handoff

Design is **locked**. Nothing is built yet. This is the next slice of P6 in
`roadmap/in-progress/field-validation-and-normalization.md` (the item currently
worded "Client-side declarative-rule mirror" — that wording is wrong, see §3).

**Branch:** `feat/client-side-field-validation`, worktree at
`.claude/worktrees/feat/client-side-field-validation`, based on `f3fa0ee`.
Deps already installed. All work happens here, not on `main`.

**Baselines to beat:** 1556 astromech tests / 111 files; `lint:deps` 0 errors,
3 pre-existing `no-circular` warnings.

---

## 1. What already shipped (context, don't rebuild)

Merged to `main` 2026-07-30:

- **Nested container validation.** `processFields` recurses into
  group/repeater/blocks/tree via a descriptor `children(field, value)` slot
  returning `{ next, scopes }`. Errors key by an `_id`-based path grammar,
  `fields/field-path.ts` (`blocks[<uuid>].heading`). `_children` is never a path
  segment. Server mints container `_id`s.
- **`ValidationError` reaching `onError`.** Every route handler used to swallow
  errors into a 500; field validation never returned a 422 over HTTP for any
  domain. 49 blanket catches removed.
- Verified end-to-end in the browser: an invalid URL inside a repeater item
  returns 422 and renders under that item's field.

## 2. The problem being solved

Validation is submit-only and server-only. `use-entry-form.ts` sends the save,
gets a 422, maps `details.fields` onto fields. Nothing validates in the browser.
An author typing a malformed URL learns about it after a round trip.

Naive "validate on blur" has a known failure mode the user explicitly called
out: tabbing through a long form to survey it turns every empty required field
red behind you. Research (NN/G, Baymard, GOV.UK, Payload/Contentful/Strapi/
Gutenberg) confirmed this is nobody's recommended behaviour.

## 3. Locked decision: completeness vs correctness

The key distinction. Do not re-derive it.

- **Completeness** — "is this finished?" → the `required` flag, and a
  container's `min` item count. **Publish-time only.** A draft save must not
  enforce them.
- **Correctness** — "is what you typed valid?" → everything else: `url`,
  `email`, `pattern`, `enum`, `minLength`/`maxLength`, container `max`,
  malformed JSON, `unique`, `custom`. **Always**, including draft save. Storing
  `htp:/x` in a URL field is a data-integrity problem, not incompleteness.

Every comparable CMS gates required-ness on publish (Payload's draft `validate`
defaults to `false`; Contentful validates only on publish; Strapi relaxes draft
save; Gutenberg uses a pre-publish panel). Sanity is the outlier and has an open
issue about exactly the complaint above.

**`pipeline.ts` already encodes this split structurally** — this is why the
change is cheap:

- `pipeline.ts:233` — `if (field.required === true && isEmpty(v))` — completeness
- `pipeline.ts:241` — container `min`, deliberately outside the `isEmpty` guard — completeness
- `pipeline.ts:249` — `if (!isEmpty(v))` guards **every** other rule, so no
  correctness rule can fire on an empty field

So there is no rule audit and no per-rule metadata. One flag on the context
gates two branches.

### Work item

Add `stage: 'save' | 'publish'` to the pipeline context (name it well —
`stage` is a suggestion). On `'save'`, skip the `required` branch and the
container `min` check. On `'publish'`, run everything. Thread it from
`entries/operations/create.ts` + `update.ts`, and from whatever the publish path
is. Note the same pipeline serves media/users/settings — pick a sensible default
(`'publish'`, i.e. current behaviour) so those domains are unaffected unless
deliberately changed.

## 4. Locked decision: one message per field, short-circuit ordering

Today `field-wrapper.tsx:35` renders `error.join(', ')` — all messages
comma-joined. A `url` field with an author rule "must be on example.com" fed a
malformed string currently renders "Must be on example.com, Must be a valid URL".

Two problems: the count, and the order. `pipeline.ts` runs declarative rules
**before** the descriptor's type-intrinsic validator, which is backwards — an
author rule is unevaluable on a value that isn't even the right type.

**Decision:** short-circuit per field, emitting the **first** failure only, in
the order coerce → type-intrinsic (descriptor `validate`) → author-supplied
rules (`field.validation`). Baymard's finding is that showing the one _matching_
message rather than a blob "dramatically reduced the number of participants who
got completely stuck."

`FieldErrors` stays `Record<string, string[]>` on the wire (don't churn the
format); the array simply carries one entry. If you'd rather keep collecting all
messages server-side for API consumers, that's acceptable — but the UI renders
one, and the _ordering_ fix is required either way.

## 5. Locked decision: one runner, not a mirror

Do **not** write a second rule engine for the browser. `fields/pipeline.ts` is
already pure — it imports only types, `descriptors.js`, `field-path.js`,
`helpers.js`. Its own doc comment says: _"Pure logic: no domain/DB imports. The
`reads` handle on `ctx` is the injection point for any async checks."_
`built-in-rules.ts` and `core-descriptors.ts` are equally clean.

So the browser runs the **same `processFields`** with a `ScopedReads` handle
that skips data-dependent checks rather than performing them.

### What can and cannot run client-side — determined by transport, not policy

`kernel/astro.ts:124` builds the admin config as
`` `export default ${JSON.stringify(buildAdminConfig(...))};` ``. Therefore:

- **Declarative rules survive** — plain JSON data. Mirrorable.
- **`custom` is a function → `JSON.stringify` drops it silently.** Server-only,
  and not by choice. The client must skip it, never attempt it.
- **`unique` survives as data but needs `ctx.reads`.** Server-only. Skip
  silently client-side (user's call: silent, not "pending").
- **Descriptor validators** (`url`, `email`, `slug`, `json`, `key-value` in
  `built-in-rules.ts`) are core code already in the browser bundle, pure, no
  reads. **Mirrorable — and this is the case the user actually hit.** The old
  roadmap wording "declarative rules only" would have missed it. The real
  criterion is **data-dependence, not declarative-vs-imperative.**

### Hard constraint from the user

`custom` validators must keep working as **async server-side validators with a
`reads` handle**, including real DB lookups and cross-record comparisons. Rare,
but the design must not foreclose it. So: the client skips `custom` entirely;
the server keeps `ctx.reads` and the async signature exactly as they are. Do not
"simplify" `FieldValidator` to sync to make mirroring easier.

## 6. Locked decision: timing

- **Blur** — validate only if the field is **dirty** (value changed from what
  loaded). Not "non-empty": a cleared field is empty but the author clearly
  acted, and a seeded default is non-empty but untouched.
- **Once a field is showing an error** — re-validate on every keystroke so it
  clears the moment it's fixed ("reward early, punish late"; blur-only leaves a
  corrected field looking broken until you leave it twice).
- **Pristine, or dirty-but-currently-valid while focused** — silent.
- **Submit** — validate everything. `required` fires here (or at publish, per §3).

`required` cannot fire on blur by construction — the field is empty, and the
dirty gate plus §3 both exclude it.

TanStack Form is already the engine and validates nothing by default;
`revalidateLogic({ mode: 'blur', modeAfterSubmission: 'change' })` plus a dirty
guard is the shape. Check the current TanStack Form docs (context7) before
wiring — do not rely on recalled API.

## 7. Locked decision: publish-time UX

Completeness failures surface **exactly like normal validation errors** —
inline, on the fields, through the same `.am-field-error` channel. Plus a
**toast** listing them, or at minimum a count. The toast already exists:
`use-entry-form.ts:123` fires `toast({ message: 'Please fix the highlighted
fields', variant: 'error' })`. Extend it to name the fields or count them.

No separate pre-publish panel. (Gutenberg's was the reference; the user chose
inline + toast instead.)

## 8. Accessibility — fixes required, sourced from research

- **Drop `role="alert"` from per-field errors.** Use a persistent
  `aria-describedby` association plus `aria-invalid="true"` on the control.
  An assertive live region clips or loses the name of the field you just tabbed
  _to_; polite appends the previous field's error after the new field's name.
  Both are worse the more text the region holds.
- **Existing latent bug:** `field-wrapper.tsx:33-37` mounts
  `<p role="alert">` _already containing_ its text. Several AT/browser
  combinations only announce content that changes **after** the region exists in
  the DOM — so our errors may not be announced at all today. If a live region is
  kept anywhere, render it always-present and swap the text.
- Reserve any live-region announcement for the **submit-time summary**, not
  per-field.
- A focusable error summary at submit is the recommended pattern (GOV.UK); the
  toast in §7 may serve this role — make it focusable/reachable if so.

Note `FieldControlContext` already exists and primitives already self-apply
`aria-invalid`/`aria-describedby` (P5b). Check what's there before adding more.

## 9. Suggested build order

Each step is independently testable and commit-worthy.

1. **`stage` on the pipeline** (§3). Server-only, no UI. Tests for
   save-skips-required and publish-enforces-it, including container `min`.
2. **Short-circuit + reorder to one message** (§4). Server-side; update the
   `FieldWrapper` render to match. Existing tests asserting multiple joined
   messages will need updating — expect churn and check each change is right.
3. **Client runner** (§5, §6). The `ScopedReads` stub, the blur/dirty wiring,
   keystroke re-validation.
4. **Accessibility** (§8).
5. **Publish toast** (§7).

## 10. Traps (all cost time this session)

- **Worktree `dist` resolution.** Plugin `typecheck` resolves `astromech`
  through `exports` → `dist`. A worktree with no `dist/` silently falls through
  to the **main checkout's** `dist`, so a new core export reads as "does not
  exist". Run `npm run build` **inside the worktree** before trusting a plugin
  typecheck.
- **Build heap.** `npm run build` DTS worker OOMs at default;
  `NODE_OPTIONS=--max-old-space-size=8192`.
- **Admin deep imports.** Browser code must deep-import pure leaves
  (`@/fields/field-path.js`), never the `fields/` barrel — it reaches server
  code (virtual config / DB). Broken admin imports pass `tsc` _and_ the library
  build; only a browser check catches them.
- **`npm run lint` is mandatory** and covers `src` only. Plugin packages have no
  lint script but the pre-commit hook lints them. Run `npx eslint` directly on
  new test files.
- **Agents misreport gates.** Re-run `typecheck`/`lint`/`test:run` yourself
  before committing; treat a report contradicting a known baseline as a red flag.
- **Never commit while sub-agents are writing** in the same worktree —
  lint-staged stashes repo-wide and can clobber their edits.
- **Other sessions are live in `main`'s tree** (ai-integration, relationships).
  Never `git stash`/`reset`/`checkout .`/`clean` there. To move uncommitted work
  between trees, use a path-scoped `git diff` + `git apply -R`.
- **Unit tests did not catch a single one of this session's four real bugs.**
  Every one needed the actual app running. Budget for browser verification.
- **Passwords:** the assistant cannot type them. Browser verification needs the
  user to sign in (`admin@astromech.dev` / `password`, `seed.ts:72,86`), demo on
  port 4323.

## 11. Open / not yet decided

- Whether `media`/`users`/`settings` should also get the save-vs-publish
  distinction, or stay always-`publish`. They have no draft concept today, so
  default them to current behaviour.
- Whether the server keeps collecting all messages per field while the UI shows
  one (§4), or short-circuits outright.
- Interaction with **staged / forward versioning**: a staged entry is incomplete
  by definition, so it should almost certainly validate at `'save'` stage — worth
  confirming against `roadmap/completed/forward-versioning.md`.
- GOV.UK's objection that screen-reader users tab through forms to survey them
  is only _mostly_ answered by the dirty gate (a user who types, then explores,
  still gets announcements). Mitigated by §8's quiet-errors approach.

## 12. When done

Tick the P6 item in `roadmap/in-progress/field-validation-and-normalization.md`
(on `main`) and **delete this spec** — specs are ephemeral. Remaining P6 after
this: error/warning severity, document-level `validate` hook, JSON-indexed
uniqueness. Plus the still-open translatable-propagation-on-create decision.
