# Forms

Reference for the options `forms()` takes and what `submit` returns. Writing a
plugin of your own is [authoring.md](authoring.md).

```ts
import { forms, turnstile } from '@astromech/forms';

export default defineConfig({
    plugins: [
        forms({
            spam: turnstile({ siteKey: '…', secretKey: '…' }),
            storeMeta: true,
            rateLimit: { limit: 20, windowMs: 60_000 },
        }),
    ],
});
```

| Option      | Default                          | What it does                                                                       |
| ----------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| `spam`      | none                             | A spam provider such as `turnstile(...)`, or your own.                             |
| `storeMeta` | `true`                           | Store the `ip` / `userAgent` / `referer` a caller sends alongside each submission. |
| `rateLimit` | `{ limit: 20, windowMs: 60000 }` | Submissions allowed per connecting address per window. `false` turns it off.       |

## The submission rate limit

`forms.submit` is a public method, so it is rate-limited by default: 20
submissions per connecting address per minute, counted before the form is
loaded and before the spam gate runs. Set `rateLimit` to your own `limit` and
`windowMs`, or to `false` to turn the limit off.

The key is the **connecting address**, which the HTTP transport derives only
from sources the client cannot set: `cf-connecting-ip` on Cloudflare Workers,
and `x-forwarded-for` when the site declares the proxy in front of it with
`security.trustProxy` — see
[../configuration/trust-proxy.md](../configuration/trust-proxy.md). The `ip` a
caller puts in `meta` is stored but never trusted.

A caller with no connecting address is not limited at all. That covers the CLI,
MCP and your own server-side code calling `submit` in process, and it also
covers an HTTP deployment where no trusted source of the address exists — a
self-hosted server behind a proxy it has not declared. There is no shared bucket
for such callers: a counter exists only for an address.

The count lives in one process. Several instances (several Workers, or several
Node processes behind a load balancer) each count their own traffic.

A refused submission comes back in the same shape as any other form-level
failure, so it renders where your other errors do:

```json
{
    "ok": false,
    "errors": { "_form": ["Too many submissions — please try again shortly"] }
}
```
