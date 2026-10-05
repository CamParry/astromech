# Forms

Reference for the options `forms()` takes, what `submit` returns, and where
submissions are kept. Writing a plugin of your own is
[authoring.md](authoring.md).

```ts
import { forms } from '@astromech/forms';

export default defineConfig({
    plugins: [
        forms({
            storeMeta: true,
            rateLimit: { limit: 20, windowMs: 60_000 },
        }),
    ],
});
```

| Option      | Default                          | What it does                                                                          |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `spam`      | the site's captcha               | Another spam service, as a `SpamProvider` object.                                     |
| `storeMeta` | `true`                           | Store the `ip` / `userAgent` / `referer` a caller sends alongside each submission.    |
| `rateLimit` | `{ limit: 20, windowMs: 60000 }` | Submissions allowed per connecting address and form per window. `false` turns it off. |

## The submission rate limit

`forms.submit` is a public method, so it is rate-limited by default: 20
submissions per connecting address per form per minute, counted once the form is
found and before its fields are checked or the spam gate runs. Set `rateLimit` to
your own `limit` and `windowMs`, or to `false` to turn the limit off. A window
starts at the first submission and resets whole once `windowMs` has passed.

The key is the **connecting address**, which the HTTP transport derives only
from sources the client cannot set: `cf-connecting-ip` on Cloudflare Workers,
`x-forwarded-for` when the site declares the proxy in front of it with
`security.trustProxy`, and otherwise the connection's own address on Node — see
[../configuration/trust-proxy.md](../configuration/trust-proxy.md). The `ip` a
caller puts in `meta` is stored but never trusted. Addresses are grouped the way
sign-in limits group them: every IPv6 address in one `/64` network shares a
count, and an IPv4-mapped IPv6 address (`::ffff:203.0.113.7`) counts as its IPv4
address.

A caller with no connecting address is not limited at all. That covers the CLI,
MCP and your own server-side code calling `submit` in process, and it also
covers a Node site where Astro's `security.allowedDomains` is set and
`trustProxy` is not, which Astromech warns about at startup. There is no shared
bucket for such callers: a counter exists only for an address. Behind a proxy
without `trustProxy`, every visitor shares the proxy's address and its one
count.

The count is kept in the database, in the plugin's `plugin_forms_rate_limits`
table, so several instances (several Workers, or several Node processes behind a
load balancer) share it. A refused submission writes nothing, so the stored
count stops at the limit. Each new window deletes the counts whose window has
passed.

A refused submission comes back in the same shape as any other form-level
failure, so it renders where your other errors do:

```json
{
    "ok": false,
    "errors": { "_form": ["Too many submissions — please try again shortly"] }
}
```

## Spam protection

Every form whose **Spam protection** toggle is on checks the token the caller
sends with `submit`, after the fields pass validation. The check is the site's
captcha, set once for sign-in and forms with `security.captcha`
([../configuration/security.md](../configuration/security.md#captcha)). With no
captcha configured and no `spam` option, nothing is checked. The check runs as a
`forms:beforeSubmit` subscriber, and a failed check refuses the submission with
nothing stored.

`get` returns `spam: { provider, siteKey, action }` for a protected form. Render
the widget with `renderCaptcha` from `astromech/shared`, ask it for
`action` (always `form_submit`), and send the token as `submit`'s `token`.

The check sends the provider the connecting address (the one the rate limit
counts) as `remoteip`. With no connecting address, it leaves `remoteip` out,
which every provider accepts. It never sends the `ip` a caller puts in `meta`.

`spam` replaces the captcha with a provider of your own, an object with a
`name`, a `siteKey` and a `verify(token, { clientAddress })` that returns
`{ ok: true }` or `{ ok: false, reason }`. It receives the same address, and the
`forms:beforeSubmit` payload carries it as `clientAddress`.

## Submissions

Each accepted submission is a row in the plugin's own table,
`plugin_forms_submissions`, holding the validated values, a one-line summary,
the form's slug and the time it arrived. Submissions are not entries: they have
no versions, locales or statuses.

The admin lists them under **Forms → Submissions**
(`/cms/plugin/forms/resources/submissions`), with search, sorting by form or
date, and a read-only screen for each one. Nothing in the admin creates or edits
a submission, since only `submit` writes one.

Grant the two permissions to the roles that should see or delete them:

```ts
import { forms } from '@astromech/forms';

roles: {
    'content-editor': {
        name: 'Content Editor',
        permissions: [...forms.permissions('read', 'delete')],
    },
},
```

`read` covers the list and each submission; `delete` covers deleting one. The
same permissions guard the service methods behind the screen, which your own
code can call: `listSubmissions({ search?, formSlug?, sort?, page, limit })`,
`getSubmission({ id })` and `deleteSubmission({ id })`.
