# Security

What Astromech protects with no configuration, and the settings that add more:
the captcha in front of sign-in, the password reset and your forms, and the
sources a captcha needs when your site sets a content security policy.

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
