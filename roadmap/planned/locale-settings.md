# Locale settings

`config.defaultLocale` does two jobs today. The admin reads it as its UI
language and date format (`packages/admin/src/i18n.ts`,
`packages/admin/src/main.tsx`), and `defaultContentLocale`
(`packages/astromech/src/config/content-locale.ts`) matches it against
`locales` to find the locale content is stored under, so `en-GB` becomes `en`.
The two can differ, and the code carries a name for each.

Follow Payload, which keeps `localization: { locales, defaultLocale }` for
content and `i18n: { fallbackLanguage, supportedLanguages }` for the admin's
language.

- [ ] `defaultLocale` is the app's default locale and must be one of `locales`;
      config resolution refuses one that is not. Drop the matching and
      `defaultContentLocale`, and read `config.defaultLocale` directly.
- [ ] The admin's language is its own setting, named after Payload's `i18n`
      options. Decide whether dates format by it or by the content locale.
- [ ] Update `apps/docs`, both demo configs and `DECISIONS.md`.
