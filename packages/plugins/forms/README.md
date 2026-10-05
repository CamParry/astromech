# @astromech/forms

Forms whose fields an editor composes in the admin, a public submission API that
validates against those fields through Astromech's own field pipeline, editor-
configured notifications, and pluggable spam protection.

One entry type is registered: `form`, what an editor builds. What gets posted
is stored in the plugin's own table, `plugin_forms_submissions`, and is read
and deleted through the plugin's service methods and a read-only admin screen
at `/cms/plugin/forms/resources/submissions`.

## Install

```ts
// astromech.config.ts
import { forms } from '@astromech/forms';
import { defineConfig } from 'astromech';

export default defineConfig({
    plugins: [forms()],
});
```

Spam protection is the site's `security.captcha` setting; see
[Spam protection](#spam-protection).

### Options

| option      | type                           | default                          | meaning                                                                          |
| ----------- | ------------------------------ | -------------------------------- | -------------------------------------------------------------------------------- |
| `spam`      | `SpamProvider`                 | the site's captcha               | Replaces the captcha check. See below.                                           |
| `storeMeta` | `boolean`                      | `true`                           | Store `ip` / `userAgent` / `referer` on each row.                                |
| `rateLimit` | `{ limit, windowMs } \| false` | `{ limit: 20, windowMs: 60000 }` | Submissions per connecting address and form per window, counted in the database. |

## Layout

```
forms/
  src/index.ts                       definePlugin() — identity + composing the surfaces below
  src/types.ts                       FormsOptions, FORM_FIELD_KINDS, FORMS_PACKAGE
  src/entries/form.ts                the `form` entry type — fields, notifications and spam tabs
  src/tables/submissions.ts          definePluginTable — the `submissions` table
  src/tables/rate-limits.ts          definePluginTable — the submission rate limit's counts
  src/repository.ts                  the submissions and rate limit repositories, built per call from ctx.db
  src/fields.ts                      the fields a stored submission is displayed through
  src/resources/submissions.ts       the Submissions admin resource
  src/permissions/forms.ts           the read and delete permissions over submissions
  migrations/                        generated — never hand-edited
  src/fields/compile.ts              stored blocks -> core Field[]
  src/service/forms.ts               the public `get` and `submit` methods, and their output schemas
  src/service/submissions.ts         listSubmissions, getSubmission, deleteSubmission, and their output schemas
  src/service/rate-limit.ts          the submission rate limit, counted per address and form
  src/hooks/events.ts                forms:beforeSubmit / forms:afterSubmit payloads
  src/notifications/                 one provider per notification kind (see below)
  src/spam/                          the spam gate: core's captcha, or a `spam` provider (see below)
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
site configured a captcha or a `spam` provider; a form can opt out of one that is
configured.

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

Forms check the token a visitor sends with the site's captcha
(`security.captcha`, which also protects sign-in), and check nothing when the
site sets none. The check is core's `verifyCaptcha` with the fixed action
`form_submit`, and it fails closed: a missing token, a bad status, an
unparseable body and a network throw all reject the submission.

`forms({ spam })` replaces it with a provider of your own, an ordinary value
rather than a closed set:

```ts
export type SpamProvider = {
    /** Identifies which widget the front end should render. */
    name: string;
    /** The public key handed to the browser. */
    siteKey: string;
    verify(
        token: string | undefined,
        context: { clientAddress?: string | undefined }
    ): Promise<{ ok: true } | { ok: false; reason: string }>;
};
```

[Spam protection](../../../apps/docs/plugins/forms.md#spam-protection) says
which address `clientAddress` carries. The secret never leaves the server: only
`provider`, `siteKey` and `action` are published to the browser. The check runs
as an ordinary `forms:beforeSubmit` subscriber, through the same extension point
a third party would use.

## Service methods

`get` and `submit` are `public`, so neither assumes a session and both report
failure as a result shape rather than a throw.

```ts
const form = await Astromech.plugins.forms.get({ slug: 'contact' });
```

Returns `null` unless the form is published and accepting submissions.
Otherwise `{ id, slug, title, fields, spam? }` — an explicit allow-list, so
notification settings and the spam secret can never ride along. `fields` is
exactly what `submit` will validate against; `spam` is
`{ provider, siteKey, action }` and appears only when the site configured a
captcha or a `spam` provider and the form uses it.

```ts
const result = await Astromech.plugins.forms.submit({
    slug: 'contact',
    data: { name: 'Ada', email: 'ada@example.com' },
    token: captchaToken, // when spam protection is on
    meta: { ip, userAgent, referer },
});
```

Returns `{ ok: true, id }`, or `{ ok: false, errors }` where `errors` is keyed by
field name. Errors that belong to the form rather than a field are keyed under
`_form`, exported as `FORM_ERROR_KEY`.

Field validation runs **before** the spam check, so a visitor whose token has
expired still sees their field errors rather than losing them.

### Stored submissions

Three methods read and delete what `submit` stored. Each needs a permission
(see below), and they back the admin screen.

```ts
const { data, pagination } = await Astromech.plugins.forms.listSubmissions({
    search: 'ada', // matches the summary or the form slug
    formSlug: 'contact',
    sort: { submittedAt: 'desc' }, // or formSlug; newest first by default
    page: 1,
    limit: 20,
});
const submission = await Astromech.plugins.forms.getSubmission({ id });
await Astromech.plugins.forms.deleteSubmission({ id });
```

A row is `{ id, formId, formSlug, data, summary, meta, submittedAt, createdAt,
updatedAt }`. `getSubmission` returns `null` for an unknown id, and
`deleteSubmission` returns `{ ok: true, id }` or `{ ok: false, reason:
'not-found' }`.

## Hooks

| event                | when                                | behaviour                                                                                          |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `forms:beforeSubmit` | after validation, before the insert | **Gating** — a subscriber that throws aborts the submission                                        |
| `forms:afterSubmit`  | after the row is committed          | A throw fails the call, though the row stays stored; carries `submissionId` and no `clientAddress` |

```ts
defineHook('forms:beforeSubmit', async (payload) => {
    if (isBlocked(payload.data)) throw new Error('Rejected');
});
```

The thrown message is what the visitor sees, so keep it presentable.

## Permissions

The plugin declares two permissions over stored submissions:

| permission            | allows                                               |
| --------------------- | ---------------------------------------------------- |
| `plugin:forms:read`   | `listSubmissions`, `getSubmission`, the admin screen |
| `plugin:forms:delete` | `deleteSubmission`, and delete in the admin          |

```ts
roles: {
    editor: { permissions: [...forms.permissions('read', 'delete')] },
},
```

Submitting needs none: `submit` is `public`. No method creates or edits a
submission by hand, so the admin screen is read-only. The `form` entry type
uses the standard plugin-mounted entry permissions,
`plugin:forms:entry:form:{action}`.
