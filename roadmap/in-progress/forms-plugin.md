# Forms Plugin (`@astromech/forms`)

Forms whose fields are composed at runtime by an editor, submitted through a
public API that validates against core's own field pipeline.

Working spec: `specs/forms-plugin.md` (on `feat/forms-plugin`, ephemeral).

## Core changes this depends on

- [ ] Custom `*:before*` events gate — `ctx.emit` currently routes every custom
      event through `runAfterHooks` (swallow-and-log), so a `forms:beforeSubmit`
      subscriber cannot reject a submission. Apply core's existing by-name
      convention (`before*` aborts on throw, `after*` is swallowed) to custom
      events too. Safe to change: `ctx.emit` has zero call sites and no plugin
      declares `hookEvents` — forms is the first consumer.
- [ ] Export `processFields` from `astromech/fields` — it is already generic over
      `FieldDefinition[]` and is what lets forms validate runtime-composed fields
      through the identical coerce → default → validate path. Without it forms
      grows a second rule evaluator that drifts from core's.

## v1

- [ ] `form` entry type — core entry storage, addressed by slug; its fields are a
      `fields.blocks('fields', …)` list, one block type per field kind (text,
      textarea, email, tel, url, number, select, radio, checkbox, checkboxGroup,
      date, hidden). No bespoke form-builder field type: `blocks` already is one.
- [ ] `submission` entry type — backed by the plugin's own
      `plugin_forms_submissions` table via `tableStorage`, as `redirect` is.
- [ ] Block → `FieldDefinition[]` compiler, so stored field config becomes real
      core field definitions for validation.
- [ ] Public `get` (render-ready projection, allow-listed so notification
      settings and secrets can't leak) + public `submit` (validate → gate →
      persist → emails), returning result shapes rather than throwing.
- [ ] `forms:beforeSubmit` (gating) / `forms:afterSubmit` (post-commit) hook events.
- [ ] Built-in Turnstile + reCAPTCHA verification, both configurable, implemented
      **as a `forms:beforeSubmit` subscriber** — the dogfooding proof that the
      extension point is real. Secrets live in plugin options from
      `import.meta.env`, never in entry content.
- [ ] Two optional per-form emails, both with configurable subject/body and
      `{{field}}` placeholders: a notification to the site and a confirmation to
      the submitter (recipient = the first `email` field, overridable).
- [ ] Register in `apps/demo` with a seeded contact form; browser-verify.

## Deliberately out of v1

- **Frontend rendering.** The site author owns the markup; the plugin exposes
  data and accepts submissions, following the `@astromech/redirects` precedent.
- **File-upload fields** — drags in a multipart `rawRoute` plus media ingest.
- **CSV export**, **rate limiting**, **per-form success redirect** (a frontend
  concern), and a **read-only entry flag** for submissions (v1 uses permissions:
  grant read + delete, withhold create + update).
