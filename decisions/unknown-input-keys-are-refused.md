---
area: structure
---

# A method input refuses undeclared keys

Every input object, core and first-party plugin, at every depth, is a `z.strictObject`, so an unknown key answers 422 `VALIDATION_FAILED`, naming the key. `fields` and other records stay open ([undeclared field keys](../roadmap/planned/undeclared-field-keys.md)). A `GET` or `DELETE` ignores undeclared query params, as Payload and GitHub do. Prior art for refusing: Stripe, Strapi 5.

**Rejected:** stripping silently (Zod's and Payload's default; an update wrapped in `{ data: … }` answers 200 and changes nothing); a 400 (other input failures answer 422); refusing unknown query params (breaks cache busters).
