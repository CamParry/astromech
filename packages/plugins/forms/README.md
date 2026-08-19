# @astromech/forms

Forms whose fields an editor composes in the admin, a public submission API that
validates against those fields through Astromech's own field pipeline, editor-
configured notifications, and pluggable spam protection.

Two entry types are registered: `form` (what an editor builds) and `submission`
(what gets posted). Submissions are stored in the plugin's **own table**
(`plugin_forms_submissions`) via `tableStorage`, not in the shared `entries`
table, and are still managed through the standard entry admin UI.

## Install

```ts
// astromech.config.ts
import { forms } from '@astromech/forms';
import { defineConfig } from 'astromech';

export default defineConfig({
    plugins: [forms()],
});
```

With spam protection:

```ts
import { forms, turnstile } from '@astromech/forms';

forms({
    spam: turnstile({
        siteKey: 'your-site-key',
        secretKey: import.meta.env.TURNSTILE_SECRET,
    }),
});
```

### Options

| option      | type           | default | meaning                                           |
| ----------- | -------------- | ------- | ------------------------------------------------- |
| `spam`      | `SpamProvider` | none    | Enables spam protection. See below.               |
| `storeMeta` | `boolean`      | `true`  | Store `ip` / `userAgent` / `referer` on each row. |

## Layout

```
forms/
  src/index.ts                       definePlugin() — identity + composing the surfaces below
  src/types.ts                       FormsOptions, FORM_FIELD_KINDS, FORMS_PACKAGE
  src/entries/form.ts                the `form` entry type — fields, notifications and spam tabs
  src/entries/submission.ts          the `submission` entry type — table-backed, API-written
  src/tables/submissions.ts          definePluginTable — the `submissions` table
  migrations/                        generated — never hand-edited
  src/fields/compile.ts              stored blocks -> core Field[]
  src/service/forms.ts               the public `get` and `submit` methods
  src/hooks/events.ts                forms:beforeSubmit / forms:afterSubmit payloads
  src/notifications/                 one provider per notification kind (see below)
  src/spam/                          one provider per spam service (see below)
  src/utilities/                     shared reads over a form entry, value display, summaries
```

## Building a form

A `form` entry has three tabs.

**Fields** — a blocks field with one block per input kind: `text`, `textarea`,
`email`, `tel`, `url`, `number`, `select`, `radio`, `checkbox`, `checkboxGroup`,
`date`, `hidden`. Every block declares a `name` (the key the value is stored
under), a `label`, whether it is `required`, and optional help text; choice kinds
add an options repeater, and text/number kinds add length and range limits.

Those blocks are compiled into real `Field`s at submit time, so a
submission is validated and coerced by the same pipeline that validates an
entry — no second validation implementation.

**Notifications** — see below.

**Spam** — a single **Spam protection** toggle. It only does anything when the
site configured a provider; a form can opt out of one that is configured.

## Notifications

Notifications are a blocks field: each block is one message sent when a
submission is accepted, and the block kind decides how it is delivered. There is
one built-in kind, `email`, with three fields:

| field     | meaning                                                               |
| --------- | --------------------------------------------------------------------- |
| `to`      | A literal address, a merge tag, or several separated by commas.       |
| `subject` | Defaults to `New submission — {{formTitle}}`.                         |
| `body`    | Rich text. Leave it empty to send just the table of submitted values. |

The difference between a site notification and a submitter confirmation is only
what the editor writes in those fields:

```
to: ops@example.com        →  a notification to the site
to: {{email}}              →  a confirmation to whoever filled the form in
```

Disable one without deleting it using the block's own disable control.

### Merge tags

`{{fieldName}}` for any field on the form, plus `{{formTitle}}` and
`{{submittedAt}}`. They work in `to`, `subject` and `body`. An unknown tag is
left visible rather than blanked, so a typo is obvious. In `to`, anything that
does not resolve to something containing `@` is dropped rather than sent to.

Every notification field is `private`, so none of it is readable through the
public entries API.

### Adding a notification kind

A notification provider owns both halves of one kind — the block an editor fills
in, and the delivery:

```ts
import type { NotificationProvider } from '@astromech/forms';

export const slackNotification: NotificationProvider = {
    type: 'slack',
    block: fields.block('slack', {
        label: 'Slack',
        fields: [fields.text('channel', { label: 'Channel', required: true })],
    }),
    deliver: async (config, context) => {
        // context carries rows, tags, values, the form entry and the plugin ctx
    },
};
```

Built-in providers are listed in `src/notifications/registry.ts`; registering a
provider there adds its block to the editor and its delivery to the dispatcher
in one step. Delivery runs after the submission row is committed, so a failure
is logged rather than returned to the visitor.

## Spam protection

A spam provider is an ordinary value, so `turnstile` and `recaptcha` are two
instances of one contract rather than a closed set:

```ts
export type SpamProvider = {
    /** Identifies which widget the front end should render. */
    name: string;
    /** The public key handed to the browser. */
    siteKey: string;
    verify(
        token: string | undefined,
        context: { ip?: string | undefined }
    ): Promise<{ ok: true } | { ok: false; reason: string }>;
};
```

Pass your own object to `forms({ spam })` to use a different service. Both
built-ins fail closed: a missing token, a bad status, an unparseable body and a
network throw all reject the submission.

```ts
turnstile({ siteKey, secretKey });
recaptcha({ siteKey, secretKey, minScore: 0.5 }); // minScore is v3 only
```

The secret key never leaves the server — only `name` and `siteKey` are published
to the browser. The check runs as an ordinary `forms:beforeSubmit` subscriber,
through the same extension point a third party would use.

## Service methods

Both methods are `public`, so neither assumes a session and both report failure
as a result shape rather than a throw.

```ts
const form = await Astromech.plugins.forms.get({ slug: 'contact' });
```

Returns `null` unless the form is published and accepting submissions.
Otherwise `{ id, slug, title, fields, spam? }` — an explicit allow-list, so
notification settings and the spam secret can never ride along. `fields` is
exactly what `submit` will validate against; `spam` is `{ provider, siteKey }`
and appears only when the site configured a provider and the form uses it.

```ts
const result = await Astromech.plugins.forms.submit({
    slug: 'contact',
    data: { name: 'Ada', email: 'ada@example.com' },
    token: turnstileToken, // when spam protection is on
    meta: { ip, userAgent, referer },
});
```

Returns `{ ok: true, id }`, or `{ ok: false, errors }` where `errors` is keyed by
field name. Errors that belong to the form rather than a field are keyed under
`_form`, exported as `FORM_ERROR_KEY`.

Field validation runs **before** the spam check, so a visitor whose token has
expired still sees their field errors rather than losing them.

## Hooks

| event                | when                                | behaviour                                                   |
| -------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `forms:beforeSubmit` | after validation, before the insert | **Gating** — a subscriber that throws aborts the submission |
| `forms:afterSubmit`  | after the row is committed          | Swallow-and-logged; carries `submissionId`                  |

```ts
defineHook('forms:beforeSubmit', async (payload) => {
    if (isBlocked(payload.data)) throw new Error('Rejected');
});
```

The thrown message is what the visitor sees, so keep it presentable.

## Permissions

The plugin declares no permissions of its own. Its two entry types use the
standard plugin-mounted entry permissions:

- `plugin:forms:entry:form:{action}`
- `plugin:forms:entry:submission:{action}`

Submission rows are written only by the `submit` method, which is `public` and
so does not consult them. Withhold `create` and `update` on
`plugin:forms:entry:submission` to keep the table API-written.
