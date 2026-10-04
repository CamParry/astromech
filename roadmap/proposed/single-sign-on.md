---
milestone: later
---

# Single sign-on

Sign in with Google, GitHub, Microsoft or a company identity provider. Raised
on 2026-10-03.

## Prior art

- Paid at Strapi (Enterprise, or a $150 a month add-on), Payload, Sanity,
  Contentful, Storyblok and Tina.
- Free at **Directus** (OAuth, OIDC, SAML, LDAP, self-hosted) and **EmDash**
  (GitHub, Google, Microsoft).
- **Better Auth** has social providers and a generic OAuth plugin.

## Open questions

- Sign-up is closed (`packages/astromech/src/auth/better-auth.ts`), so an
  account must exist first and be matched by email. Is that enough, or does a
  provider's domain grant a default role?
- SAML and LDAP, or OAuth and OIDC only?
