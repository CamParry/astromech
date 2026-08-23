# 0002 — Forms notifications as blocks, and spam as a provider contract

**Date:** 2026-08-02
**Status:** accepted

Form notifications become one `notifications` blocks field (rejecting a repeater, which cannot vary shape per notification kind), with no separate confirmation concept since a `{{email}}` merge tag in `to` decides the recipient; spam protection becomes a `SpamProvider` object contract with `turnstile()`/`recaptcha()` factories (rejecting an internal-only registry) so sites can supply their own; helpers move to `utilities/` (rejecting `lib/`).
