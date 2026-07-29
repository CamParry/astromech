# Forms Plugin (`@astromech/forms`)

Forms whose fields are composed at runtime by an editor, submitted through a
public API that validates against core's own field pipeline.

Shipped on `feat/forms-plugin`, merged to main 2026-07-29.

## Core changes this depended on

- [x] Custom `*:before*` events gate — `ctx.emit` routed every custom event
      through `runAfterHooks` (swallow-and-log), so a `forms:beforeSubmit`
      subscriber could not reject a submission. `emitEvent` now applies core's
      existing by-name convention (`:before` aborts on throw, everything else is
      swallowed). Safe to change: `ctx.emit` had zero call sites and no plugin
      declared `hookEvents` — forms is the first consumer.
- [x] Export `processFields` from `astromech/fields` — generic over
      `FieldDefinition[]`, so forms validates runtime-composed fields through the
      identical coerce → default → validate path instead of growing a second rule
      evaluator.
- [x] Export `renderRichText` from `astromech` — the email bodies are `private`,
      so they cannot be obtained as HTML from a public read, and the only
      alternative was a second copy of the sanitizer.
- [x] **Bug fix:** the `enum` rule tested whether the _whole_ value was a
      permitted string, so `multiselect` (an array) was rejected for every
      non-empty selection. Pre-existing; forms was the first consumer to pair
      them.

## v1 — all shipped

- [x] `form` entry type — core entry storage, addressed by slug; fields are a
      `fields.blocks('fields', …)` list, one block per kind (text, textarea,
      email, tel, url, number, select, radio, checkbox, checkboxGroup, date,
      hidden). No bespoke form-builder field type: `blocks` already is one.
- [x] `submission` entry type — the plugin's own `plugin_forms_submissions` table
      via `tableStorage`, plus a denormalised `summary` column computed at submit
      time (no `CellKind` can summarise a JSON blob).
- [x] Block → `FieldDefinition[]` compiler.
- [x] Public `get` (allow-listed projection) + public `submit`
      (validate → gate → persist → emails), returning result shapes.
- [x] `forms:beforeSubmit` (gating) / `forms:afterSubmit` (post-commit) events.
- [x] Built-in Turnstile + reCAPTCHA, registered **as a `forms:beforeSubmit`
      subscriber** — the built-in providers use the same extension point a third
      party would. Fails closed on every error path.
- [x] Two optional per-form emails with `{{field}}` placeholders in subject and
      body. Body placeholders substitute into the ProseMirror JSON _before_
      rendering — substituting into the rendered HTML would splice submitted
      answers past the sanitizer.
- [x] Registered in `apps/demo` with a seeded contact form; browser-verified.

## Found while building

Two pre-existing bugs this work surfaced and fixed, both in their own commits:

- The `enum` rule vs multi-value fields (above).
- `useBlocksField` / `useTreeField` never seeded when their value arrived after
  the first render, so an entry's blocks or tree rendered permanently empty. It
  looked intermittent because a warm query cache can supply the data on the
  first render.

And one left alone, since it belongs to the admin router rather than here: the
root `/entries/<qualified-type>` route renders for a plugin entry type but
generates unencoded links that 404. Nothing links there — plugin types have
their own `/plugin/<ns>/entries/<type>` route — so it is a latent trap, filed in
`backlog.md`.

## Deliberately out of v1

- **Frontend rendering.** The site author owns the markup; the plugin exposes
  data and accepts submissions, following the `@astromech/redirects` precedent.
- **File-upload fields** — drags in a multipart `rawRoute` plus media ingest.
- **CSV export**, **rate limiting**, **per-form success redirect** (a frontend
  concern), and a **read-only entry flag** for submissions (v1 uses permissions:
  grant read + delete, withhold create + update).

All of the above are in `backlog.md`.
