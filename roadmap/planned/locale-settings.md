# Locale settings

`config.defaultLocale` does two jobs today. The admin reads it as its UI
language and date format (`packages/admin/src/i18n.ts`,
`packages/admin/src/main.tsx`), and `defaultContentLocale`
(`packages/astromech/src/config/content-locale.ts`) matches it against
`locales` to find the locale content is stored under, so `en-GB` becomes `en`.
The two can differ, and the code carries a name for each.

## Prior art

Every system compared keeps the two apart: Payload (`localization` and `i18n`),
Strapi (`default_locale` and the admin user's `preferedLanguage`), Directus
(`default_language` and `user.language`), WordPress (the site locale and the
user's `locale`). Every one but Payload lets each user pick a language. None
formats admin dates by the content locale. Directus picks its date-fns locale
from the UI language, full tag first, so `en-GB` gives British dates; Payload's
fixed pattern gives British users American ones. Only the admin-language side
matches a regional tag to its base language; no content side does.

## Decided (2026-10-02)

- **Content keeps `locales` and `defaultLocale`**, the names Astro's own `i18n`
  config uses. `defaultLocale` must be one of `locales`, and config resolution
  refuses one that is not (stricter than Payload, which never checks).
  `defaultLocale` defaults to `'en'` and `locales` to `[defaultLocale]`.
- **The admin's language is `admin.language`**, a BCP 47 tag such as `'en-GB'`,
  beside `admin.pages`. "Language" rather than "locale" keeps the admin's
  setting apart from content's locales by name, and is the browser's word
  (`navigator.language`), Directus's and WordPress's UI's. Rejected:
  `admin.locale`, which reads as one of `locales`; a top-level `i18n` key
  (Payload's), which on an Astro site would mean two things in two configs.
- **Each user has a language preference**, set on their own user page. The admin
  resolves its language from the user's preference, then `admin.language`, then
  `navigator.language`, then `'en'`.
- **Admin dates format by the full tag** (`en-GB` gives `14 Jun 2026`) while UI
  strings fall back to the base language's translation, as i18next's
  `load: 'languageOnly'` already does.
- **Astro's `i18n` config is not read.** The core is framework-agnostic, and two
  sources for one fact drift. The docs show the two configs side by side.

## The work

- [ ] Config resolution validates `defaultLocale` against `locales` and applies
      both defaults. Delete `defaultContentLocale` and `getDefaultContentLocale`
      and read `config.defaultLocale` at their call sites
      (`grep -rn "efaultContentLocale" packages/astromech/src`), with
      `tests/config/content-locale.test.ts`. Delete the dev warning in
      `packages/admin/src/main.tsx` that the validation replaces.
- [ ] `admin.language` in `AstromechConfig` and the admin config served to the
      SPA; `i18n.ts` and `setDateLocale` read the resolved language.
- [ ] A nullable `language` column on `users` (an account setting, not a
      per-locale field). Run `pnpm run db:generate` and hand-apply the change to
      `apps/demo-cloudflare`'s migration and snapshot. Accept any tag
      `Intl.getCanonicalLocales` accepts.
- [ ] A language select in `packages/admin/src/components/users/user-profile-fields.tsx`,
      listing each language the admin ships a translation for with its regional
      variants, named with `Intl.DisplayNames`, plus "Site default".
- [ ] Update `apps/docs`, both demo configs, `TERMINOLOGY.md` (Language and
      Locale, each naming the other) and `DECISIONS.md`.
