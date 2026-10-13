---
area: structure
---

# Hook output that fails its schema is a 500

The caller's data is parsed before a before-hook sees it, so a failure there is the caller's 422. What the hooks leave is parsed again (`parseHookOutput` in `packages/astromech/src/services/parse-method-output.ts`), and a failure then is the hook's: a `HookOutputValidationError`, logged and answered as a 500. Payload's `beforeValidate` shows hook errors to the caller because nothing was validated yet; here it was.

**Rejected:** one parse after the hooks (a 422 for a key a plugin added); not parsing hook output (writes whatever a hook returns).
