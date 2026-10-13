---
area: product
---

# Form notifications are one blocks field

A form's notifications are one `notifications` blocks field, and an `{{email}}` merge tag in `to` picks the recipient (`packages/plugins/forms/src/entries/form.ts`). Spam protection defaults to core's captcha check, and `spam` takes an open `SpamProvider` for another service (`packages/plugins/forms/src/spam/types.ts`).

**Rejected:** a repeater (cannot vary its shape per kind); an internal-only spam registry; provider factories in the plugin (left sign-in unprotected).
