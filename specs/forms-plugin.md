# `@astromech/forms` — working spec

Ephemeral. Delete when the feature ships; never link from durable docs.

Roadmap: `roadmap/in-progress/forms-plugin.md`.

## 1. Scope

**In (v1)**

- A `form` entry type whose **fields** are composed at runtime by an editor.
- A `submission` entry type backed by the plugin's own table.
- A public `submit` service method that validates against the form's stored
  fields using **core's own field pipeline**.
- Gating `forms:beforeSubmit` + post-commit `forms:afterSubmit` hook events.
- Turnstile **and** reCAPTCHA verification, shipped in-box, configurable,
  implemented **as a `forms:beforeSubmit` subscriber** — the dogfooding proof
  that the extension point is real.
- Two optional, per-form configurable emails: a **notification** to the site
  and a **confirmation** to the submitter.

**Out (v1)** — each goes to `backlog.md`

- Any frontend rendering. The site author owns the markup; the plugin exposes
  data (`forms.get`) and accepts submissions (`forms.submit`). This follows the
  `@astromech/redirects` precedent: the plugin exposes data, the app owns the
  route.
- File-upload fields (drags in a multipart `rawRoute` + media ingest).
- CSV export of submissions.
- Rate limiting.
- Per-form success redirect (a frontend concern).

## 2. Core changes this depends on

All four are small and land on this branch. 2a–2c were audited as having zero
existing consumers; 2d is a bug fix.

### 2a. Custom `*:before*` events must gate

`ctx.emit` → `emitEvent` → `runAfterHooks`, which is swallow-and-log. A
Turnstile handler that throws would be logged and the spam submission saved
anyway, so the roadmap's "Turnstile via `forms:beforeSubmit`" cannot work as
written.

Core already draws the gating line **by name** — `types/hooks.ts`: "`before*`
handlers gate the operation (a throw aborts); `after*` handlers run post-commit
and are swallow-and-logged".

**Change:** `emitEvent` applies that same rule to custom events — an event whose
name contains `:before` runs through `runBeforeHooks` (throws propagate);
everything else keeps swallow-and-log. No new API, and the convention already
documented for core events now holds for plugin events too.

**Why it's safe:** `ctx.emit` has **zero call sites** in the repo and no plugin
declares `hookEvents`. Forms is the first consumer of the custom-event system,
so there is no behaviour to preserve.

Update the doc comments on `ctx.emit`, `hookEvents` and `emitEvent` to state the
convention.

### 2b. Export the field pipeline

`processFields(values, definitions, ctx)` in `fields/pipeline.ts` is generic over
`FieldDefinition[]` — it is not entries-specific. It is exactly what forms needs
to validate runtime-composed fields through the identical
coerce → default → validate path as every other domain, including the
serializable `ValidationRule` union.

It is currently unexported (`fields/index.ts` re-exports only `builder.js`).

**Change:** export `processFields` and its context/error types from
`astromech/fields`.

**Why:** the alternative is a second rule evaluator inside forms that silently
drifts from core's.

### 2c. Export `renderRichText`

`renderRichText` (`fields/rich-text/index.ts`) is internal, used only by
`entries/visibility.ts` to render richtext on public reads. Forms needs it to
turn a stored email body into HTML for `ctx.sendEmail` — and cannot get it from
a public read, because those bodies are `private` (§8).

**Change:** export it from the public surface alongside `processFields`.

**Why:** the only alternative is forms reimplementing core's ProseMirror
sanitizer, which is exactly the drift 2b exists to avoid — and a sanitizer is
the worst possible thing to have two of.

Implementation note: `processFields`'s ctx requires a `reads` port for `unique`
and reference rules. Forms never emits those rules, so it passes a stub that
throws if called — verify the exact `FieldValidationContext` shape when wiring.

### 2d. The `enum` rule must accept multi-value fields

Found while reviewing the compiler. `runRule`'s `enum` branch was
`rule.enum.includes(value)`, which asks whether the _whole value_ is a permitted
string. A `multiselect` — and so a checkbox group — holds an **array**, so that
test rejected every non-empty selection with "Must be one of: …".

**Change:** the rule now means "every selected value is permitted", normalising a
scalar to a one-element array.

This is a pre-existing core bug affecting any `multiselect` + `enum` pairing, not
just forms; it simply had no consumer until now. Regression tests added in
`tests/fields/pipeline.test.ts`.

## 3. Package

`packages/plugins/forms`, package `@astromech/forms`, namespace `forms`,
service key `forms`. Layout mirrors `redirects`: `src/index.ts` holds the
`definePlugin` call, sub-modules stay identity-unaware and read identity from
`ctx.plugin`.

`tsup` builds two entries — `index` and a `./schema` subpath shipping only the
table descriptor, so `plugin:generate` can load the schema standalone.

### Options

```ts
type FormsOptions = {
    spam?: {
        provider: 'turnstile' | 'recaptcha';
        siteKey: string;
        /** Read from `import.meta.env` in the site's config — never stored in content. */
        secretKey: string;
        /** reCAPTCHA v3 only. Default 0.5. */
        minScore?: number;
    };
    /** Store ip / userAgent / referer on each submission. Default true. */
    storeMeta?: boolean;
};
```

Secrets live in site config, not in entry content. Per project convention the
site reads them with `import.meta.env`, not `process.env`.

## 4. The `form` entry type — `forms/form`

Default (core) entry storage — the slug is how the frontend addresses a form,
and core's built-in storage already enables slugs, so the key is omitted
entirely. (`EntryTypeConfig.slug` is `SlugConfig | false`; there is no `true`
literal to pass.) The entry `title` is the form's name.

Fields, grouped into tabs:

**Fields tab**

- `enabled` (boolean, default true) — accept submissions.
- `fields` — `fields.blocks('fields', { blocks: [...] })`.

Each block type is one field kind. Every block carries `label` (required),
`name` (the key in submission data, required), `required` (boolean) and
`description`. Note the field API has **no `helpText`** — `BaseOptions` is
`label`, `required`, `defaultValue`, `description`, `validation`,
`translatable`, `searchable`, `private`, and nothing else. There is likewise no
read-only or disabled option. Per-kind extras:

| `_type`         | Extra config                      | Compiles to          |
| --------------- | --------------------------------- | -------------------- |
| `text`          | placeholder, minLength, maxLength | `fields.text`        |
| `textarea`      | placeholder, maxLength, rows      | `fields.textarea`    |
| `email`         | placeholder                       | `fields.email`       |
| `tel`           | placeholder                       | `fields.text`        |
| `url`           | placeholder                       | `fields.url`         |
| `number`        | min, max                          | `fields.number`      |
| `select`        | options, placeholder              | `fields.select`      |
| `radio`         | options                           | `fields.radioGroup`  |
| `checkbox`      | — (single consent box)            | `fields.boolean`     |
| `checkboxGroup` | options                           | `fields.multiselect` |
| `date`          | —                                 | `fields.date`        |
| `hidden`        | defaultValue                      | `fields.text`        |

Stored instances use the reserved block keys — `{ _type, _id, name, label, … }`
— so `_type` is what the compiler switches on. The author-side schema keeps
`type`.

**Notifications tab**

Every field in this tab is declared `private: true`. `forms/form` entries are
readable through the **public** entries API, so without it the notification
recipients and copy would be world-readable on any published form. Core strips
`private` fields from the public shape, which makes this an enforced boundary
rather than a convention `get` has to remember.

- `notifyEnabled` (boolean)
- `notifyTo` (repeater of email)
- `notifySubject` (text, placeholders allowed)
- `notifyBody` (richtext, optional — empty means "the default answers table")
- `confirmEnabled` (boolean)
- `confirmSubject` (text)
- `confirmBody` (richtext)
- `confirmToField` (text, optional) — names the field holding the submitter's
  address. Empty means "the first `email` field on the form".

**Spam tab**

- `spamProtection` (boolean, default true) — only has effect when the plugin is
  configured with a provider.

## 5. The `submission` entry type — `forms/submission`

`storage: tableStorage(submissionsTable)`, exactly as `redirect` does. Table
`plugin_forms_submissions`:

| Column                    | Type           | Notes                                 |
| ------------------------- | -------------- | ------------------------------------- |
| `id`                      | ulid, pk       |                                       |
| `formId`                  | text, indexed  | the form entry's id                   |
| `formSlug`                | text           | denormalised for listing              |
| `data`                    | json           | the submitted answers                 |
| `summary`                 | text, nullable | see below                             |
| `meta`                    | json, nullable | ip / userAgent / referer              |
| `submittedAt`             | timestamp      |                                       |
| `createdAt` / `updatedAt` | timestamp      | required by `tableStorage`, see below |

`summary` is a short human-readable rendering of `data`, computed once at submit
time. It exists because the submissions list needs a column an editor can scan,
and no `CellKind` can summarise a JSON blob — the text cell is `String(value)`,
which renders an object as `[object Object]`.

`createdAt`/`updatedAt` are not optional decoration: `tableStorage` defaults
`timestamps` on and assumes both columns exist, so omitting them without passing
`{ timestamps: false }` decodes `undefined` into an Invalid Date.

Entry config: `titleField: false`, `statuses: false`, `slug: false`,
`trash: false`. Admin columns: form, submitted-at, a short summary of `data`.

Submissions are not hand-authored. v1 relies on permissions for that (grant read

- delete, withhold create + update) rather than a new read-only entry flag.

Migrations come from `astromech plugin:generate` — never hand-authored. Note
that a worktree needs `npm install` before generation works.

## 6. Service

Both methods are `access: 'public'` with a declared effect (`mutates` is
mandatory). Per the plugin-consistency sweep, RPC has **no status channel**, so
failures are result shapes, not throws.

```ts
service: {
    get:    { access: 'public', mutates: false, handler: … },
    submit: { access: 'public', mutates: true,  handler: … },
}
```

**`get({ slug })`** returns a render-ready public projection: title, slug,
`enabled`, the compiled field list, and — when configured — the spam provider
and its **site** key.

It must **never** leak notification settings or secrets. Two independent
defences, because this is the one method an anonymous caller can reach:

1. The notification fields are `private: true` (§4), so core strips them from
   the public shape regardless of what this method does.
2. `get` still builds its result by **explicit allow-list**, never by spreading
   the entry — `ctx.entries` defaults to the `full` shape at plugin altitude, so
   a public shape is not what you are handed.

A test asserts a `full`-shaped form entry does not leak notification settings
through `get`.

**`submit({ slug, data, token? })`** → `{ ok: true, id }` or
`{ ok: false, errors: FieldErrors }`.

Flow:

1. Load the form by slug. Missing, unpublished or `enabled: false` → error result.
2. Compile stored blocks → `FieldDefinition[]`; run `processFields`. Errors →
   `{ ok: false, errors }`.
3. `ctx.emit('forms:beforeSubmit', payload)` — **gating** (§2a). The plugin's own
   spam handler subscribes here; a throw becomes an error result.
4. Persist the submission.
5. `ctx.emit('forms:afterSubmit', payload)` — swallow-and-log.
6. Send emails. Failures are logged, never fatal — the submission is already
   committed.
7. `{ ok: true, id }`.

Field validation runs _before_ the spam gate so a legitimate user with an
expired token still sees their field errors.

`hookEvents: ['forms:beforeSubmit', 'forms:afterSubmit']`.

## 7. Spam protection

Registered by the plugin itself, only when `options.spam` is set:

```ts
hooks: spamConfigured ? [defineHook('forms:beforeSubmit', spamHook)] : [],
```

The handler reads `token` from the payload, POSTs to the provider's verify
endpoint (Turnstile `siteverify`, reCAPTCHA `siteverify`), and throws on
failure — which the gating change turns into a rejected submission. reCAPTCHA v3
additionally compares `score` against `minScore`.

It skips when the form has `spamProtection: false`.

This is the dogfooding requirement from the roadmap: the built-in providers use
the same public extension point a third party would.

## 8. Emails

Both optional and per-form configurable. Rendered as React Email components
wrapped in core's exported `BaseLayout`, sent via `ctx.sendEmail`.

- **Notification** → each address in `notifyTo`. Body is `notifyBody`, or a
  default table of every submitted field when empty.
- **Confirmation** → the submitter, resolved from `confirmToField` or the first
  `email` field. Skipped silently when no address is present.

Placeholders `{{fieldName}}`, `{{formTitle}}` and `{{submittedAt}}` are
substituted from the submission, in both the subject and the body.

**Where substitution happens is a security decision.** Subjects are plain
strings. Bodies are rich text, and the rendered HTML goes to
`dangerouslySetInnerHTML` — so substituting into the _rendered string_ would
splice submitted answers in past the sanitizer. Instead the tokens are
substituted into the body's **ProseMirror JSON**, and rendering happens after,
because the renderer escapes text-node content. An answer containing
`<script>` therefore arrives as visible text.

Two supporting guarantees, both tested:

- Core's renderer really does escape text nodes
  (`tests/fields/rich-text-escaping.test.ts`) — the assumption the above rests
  on, pinned rather than trusted.
- Only the `text` of text nodes is substituted. Marks and attrs are left alone,
  so a token in a link's `href` stays literal — otherwise a submitted value
  could choose a URL.

**Rich text → HTML.** `ctx.sendEmail` takes a `ReactElement`, but the bodies are
stored as ProseMirror JSON. Core renders richtext to sanitized HTML on **public**
reads (`entries/visibility.ts`), and `renderRichText` is internal.

An earlier draft planned to read the form a second time with `full: false` to
obtain that HTML. **That does not work**, because §4 marks every notification
field `private: true` — a private field is stripped from the public shape
entirely, so the second read returns nothing to render.

v1 therefore takes the third core change in §2c: export `renderRichText`, and
render the stored JSON directly. The two requirements are in genuine tension —
the bodies must be invisible to public reads _and_ renderable by the plugin —
and a public renderer is the only thing that satisfies both without forms
duplicating core's sanitizer.

## 9. Permissions

None declared. Core derives entry permissions for `forms/form` and
`forms/submission` from the registered entry types; a site grants them with
`entryPermissions('forms/form', …)`. This matches `redirects`, which likewise
declares no plugin permissions.

## 10. Admin

No custom admin pages in v1 — both entry types get the standard entry UI. The
blocks field gives the form builder its editor for free.

## 11. Verification

- `npm run typecheck`, `npm run lint`, full test suite, `npm run build`.

    **Trap:** the root `build` and `typecheck` scripts do not use the
    `packages/plugins/*` workspace glob — they hardcode each plugin by name
    (`-w @astromech/menus -w @astromech/redirects …`). A new plugin is invisible
    to the root gate until it is added to both. `@astromech/forms` has been. Root
    `lint` covers only schema-engine and astromech; plugin packages have no lint
    script and are linted by the pre-commit hook instead, so lint them directly
    with `npx eslint packages/plugins/forms/src` when verifying by hand.

- Tests (real fixtures, never a mocked DB): the block→`FieldDefinition`
  compiler, `submit` happy path, `submit` validation failure shape, the gating
  hook actually aborting, `get` **not** leaking notification settings or the
  spam secret, and both email paths.
- Register the plugin in `apps/demo`, seed a contact form, browser-verify on
  port 4323 (`admin@astromech.dev` / `password`). Remember the demo loads the
  library from `dist/` — rebuild and restart the dev server first. Discard demo
  DB writes afterwards.
