# Security

What Astromech protects with no configuration, and the settings that add more:
the block list and allow list, the `Strict-Transport-Security` header, the
captcha in front of sign-in, the password reset and your forms, and the sources
a captcha needs when your site sets a content security policy.

## What is on by default

A site with no `security` setting still has:

- **Sign-in limits per address.** Better Auth counts requests per address and
  path and answers `429` over the limit. The address is the connecting one, so
  set `security.trustProxy` behind a proxy:
  [trust-proxy.md](trust-proxy.md).
- **An account lock.** Five refused sign-ins as one email within 15 minutes lock
  that email for 5 minutes. Each further lock doubles: 10, 20, 40, then 60
  minutes, the longest. While it lasts, sign-in answers `429` with the code
  `ACCOUNT_LOCKED` and a `Retry-After` header, even for the right password. A
  successful sign-in or a completed password reset clears the count, and a
  password reset works while an account is locked, so a stranger who locks your
  account cannot keep you out of it. A lock level resets after a day with no
  further failures. An email that has no account locks the same way, so a lock
  never tells anyone which emails have one.
- **Automatic address blocks.** An address that gets 20 sign-ins refused within
  15 minutes, across any accounts, is blocked for an hour. An IPv6 address is
  blocked as its `/64` network. An address on the allow list is never blocked,
  and an automatic block never shortens a block you added by hand.
- **Response headers on the API.** `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin`,
  with Hono's other defensive defaults such as `Cross-Origin-Opener-Policy`. The
  first three, and `Permissions-Policy`, can be changed with `security.headers`.
- **`frame-ancestors 'self'` on the admin pages**, so another site cannot frame
  your admin. The admin can still frame your own site.

`Strict-Transport-Security` is not sent unless you ask for it; see
[HSTS](#hsts).

## Blocked and allowed addresses

The block list holds addresses and CIDR ranges (`203.0.113.7`,
`198.51.100.0/24`) that get `403` from the admin pages and everything under
`/cms/api`. The allow list holds addresses that no block applies to, such as an
office. Media files and your site's own pages are not covered: a page built
ahead of time never reaches Astromech, so block those at your host or CDN.

Manage both lists in the admin under **System → Security**, which needs the
`security:manage` permission (administrators have it). A block takes an optional
reason and an expiry of an hour, a day, a week or none; one the server added
after repeated failed sign-ins is marked Automatic and expires on its own. You
cannot block a range that covers your own address.

Each server process, and each Workers isolate, keeps its copy of the lists for
up to 60 seconds, so a change reaches the others within a minute. If you lock
yourself out of the admin anyway, remove the block from a terminal on the
server, which has no address to block:

```sh
astromech call security.listBlocked
astromech call security.unblock --args '{"id":"…"}'
```

`security.listAllowed`, `security.allow`, `security.block` and
`security.removeAllowed` are there too; [../cli.md](../cli.md) covers `call`.

## HSTS

`security.hsts` sends `Strict-Transport-Security` on API and admin responses. It
is off by default, because a browser that has seen the header refuses plain HTTP
for the whole host until `max-age` runs out, which can break a staging site or
another service on the same host name.

```ts
export default defineConfig({
    security: {
        hsts: true, // max-age=31536000
    },
});
```

| Value                                                          | Header sent                                    |
| -------------------------------------------------------------- | ---------------------------------------------- |
| unset or `false`                                               | none                                           |
| `true`                                                         | `max-age=31536000`                             |
| `{ maxAge: 86400 }`                                            | `max-age=86400`                                |
| `{ maxAge: 31536000, includeSubDomains: true }`                | `max-age=31536000; includeSubDomains`          |
| `{ maxAge: 31536000, includeSubDomains: true, preload: true }` | `max-age=31536000; includeSubDomains; preload` |

`preload` needs `includeSubDomains` and a `maxAge` of at least a year, or the
browsers' preload lists refuse the host, so Astromech refuses to start with
anything less. The header covers the whole host, not just `/cms`: only turn it on
when every page and subdomain on it serves HTTPS. Your own pages are not sent
the header by Astromech; set it for them at your host.

## Captcha

`security.captcha` puts one captcha check in front of three things: the admin
sign-in, the password reset request, and every form in `@astromech/forms`. Set
the provider and its public site key in `astromech.config.ts`, and the secret in
the environment:

```ts
export default defineConfig({
    security: {
        captcha: { provider: 'turnstile', siteKey: '0x4AAAAAAA…' },
    },
});
```

```sh
ASTROMECH_CAPTCHA_SECRET=…
```

On Cloudflare Workers, set the secret with `wrangler secret put
ASTROMECH_CAPTCHA_SECRET`. A production server with a captcha configured and no
secret refuses every request with a 500, as it does without `BETTER_AUTH_SECRET`.

| Option      | Default           | What it does                                                  |
| ----------- | ----------------- | ------------------------------------------------------------- |
| `provider`  | none, required    | `turnstile`, `recaptcha` or `hcaptcha`.                       |
| `siteKey`   | none, required    | The provider's public key, sent to the browser.               |
| `minScore`  | `0.5`             | `recaptcha` only: the lowest score (0 to 1) a token may have. |
| `hostnames` | the request's own | The hostnames a token may come from. Set it behind a proxy.   |

### What is checked

The server asks the provider whether the token is genuine and unused, then
checks what the provider reports back:

| Provider    | Checked                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| `turnstile` | The token, its action, and its hostname.                                                  |
| `recaptcha` | reCAPTCHA v3 only: the token, its action, its hostname, and its score against `minScore`. |
| `hcaptcha`  | The token, the site key it was solved on, and its hostname. hCaptcha reports no action.   |

Each form asks for its own action name (`sign_in`, `password_reset` and
`form_submit`), so a token solved on one form is refused on another, except with
hCaptcha, which cannot tell them apart. A reCAPTCHA v2 token carries no action
and is refused: create a v3 key. Every check fails closed: a missing token, an
unreachable provider and a malformed answer all refuse the request.

The hostname defaults to the one the request arrived on. Behind a proxy that can
be an internal name, so list the public ones in `hostnames`. Turnstile's
documented test secrets always answer the hostname `example.com`, so a site
tested with them needs `hostnames: ['example.com']`.

A refused sign-in or reset request answers 403 with the code `CAPTCHA_FAILED`.
The check runs before the sign-in limits count the attempt, so it costs one
request to the provider per attempt that carries a token; an attempt with no
token costs none.

### On your own forms

`@astromech/forms` uses the captcha by default, and `get` returns the widget to
render, `spam: { provider, siteKey, action }`; see
[../plugins/forms.md](../plugins/forms.md#spam-protection). On any other form of
your site, render the widget with `renderCaptcha` from `astromech/shared` in the
browser, and send the token in the `x-captcha-response` header:

```ts
import { CAPTCHA_ACTIONS, CAPTCHA_HEADER, renderCaptcha } from 'astromech/shared';

const widget = await renderCaptcha(document.querySelector('#captcha')!, {
    provider: 'turnstile',
    siteKey: '0x4AAAAAAA…',
    action: CAPTCHA_ACTIONS.signIn,
});

const response = await fetch('/cms/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        [CAPTCHA_HEADER]: await widget.getToken(),
    },
    body: JSON.stringify({ email, password }),
});
widget.reset(); // a token works once
```

`renderCaptcha` loads the provider's script once per page, however many widgets
you render, and reCAPTCHA v3 shows no widget at all. To check a token in your
own server code, call `verifyCaptcha({ token, action })` from `astromech`.

### Content security policy

A site that sets Astro's `security.csp` must allow the provider's script and
frames, on its own pages and on the admin, which the policy covers too:

| Provider    | Directives                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `turnstile` | `script-src` and `frame-src`: `https://challenges.cloudflare.com`                                                                                                              |
| `recaptcha` | `script-src`: `https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`; `frame-src`: `https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/` |
| `hcaptcha`  | `script-src`, `frame-src`, `style-src` and `connect-src`: `https://hcaptcha.com https://*.hcaptcha.com`                                                                        |

```ts
// astro.config.mjs
export default defineConfig({
    security: {
        csp: {
            scriptDirective: {
                resources: ["'self'", 'https://challenges.cloudflare.com'],
            },
            directives: ['frame-src https://challenges.cloudflare.com'],
        },
    },
});
```
