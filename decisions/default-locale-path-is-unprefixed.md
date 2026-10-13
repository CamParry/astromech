---
area: data
---

# The default locale's path is unprefixed

The default content locale's URLs have no prefix and other locales sit under `/{locale}`, as in Astro's default `i18n` routing (`packages/astromech/src/entries/entry-url.ts`). An Astro config with another default locale, `prefixDefaultLocale: true`, manual routing or domains gets wrong paths.

**Rejected for now:** reading Astro's `i18n` config (core also runs outside Astro); a prefix option (nothing needs it).
