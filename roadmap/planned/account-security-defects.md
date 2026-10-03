# Account security defects

Found on 2026-10-03 while planning `roadmap/planned/core-security.md`.

- **A signed-in user can change their own email with no password.**
  `PUT /api/users/:id` lets a caller update their own row without
  `users:update` (`packages/astromech/src/transport/http/routes/users.ts`), email
  included. A stolen session can change the email and then reset the password.
- **A password reset leaves every session signed in.** Better Auth's
  `revokeSessionsOnPasswordReset` is unset in
  `packages/astromech/src/auth/better-auth.ts`, and nothing in Astromech
  revokes sessions.
- **The forms spam check sends the caller-supplied address.** The
  `forms:beforeSubmit` hook (`packages/plugins/forms/src/spam/hook.ts`) passes
  `event.meta?.ip` to Turnstile and reCAPTCHA as `remoteip`, a value
  `apps/docs/plugins/forms.md` says is never trusted, rather than the trusted
  client address.
- **A user without `admin:access` is sent back to the sign-in form with no
  message.** Sign-in succeeds, the protected route guard redirects to `/login`
  (`packages/admin/src/pages/_protected/route.tsx`), and the login page does not
  say why.

The class: an account change or a trust decision that skips the check the rest
of the system applies (the password, the trusted address, the permission).

## The work

- [ ] Changing your own email needs a confirmed password
      (`roadmap/planned/two-factor-and-passkeys.md`); until that lands, refuse
      an email change on the self-access path.
- [ ] Set `revokeSessionsOnPasswordReset`, and revoke other sessions on a
      password change.
- [ ] Pass the trusted client address to the spam providers.
- [ ] Tell a user without admin access why they cannot sign in to the admin.
- [ ] Tests for each.
