---
area: product
---

# Captcha is one core check

`security.captcha` names Turnstile or reCAPTCHA v3, `ASTROMECH_CAPTCHA_SECRET` holds the secret, and one check guards sign-in, the reset request and `@astromech/forms` (`packages/astromech/src/security/captcha/verify.ts`). The token travels in `x-captcha-response`, the header Better Auth's own plugin reads, because the middleware must not consume the body Better Auth parses.

**Rejected:** Better Auth's `captcha` plugin (one `expectedAction` for every endpoint; never reaches a hook); hCaptcha (Turnstile already serves sites avoiding Google; a third set of keys, scripts and CSP rules).
