# Internationalisation

- [x] Symmetric locale model: `locale_group` UUID (no primary translation), `UNIQUE(locale_group, locale)` + `UNIQUE(type, locale, slug)`, per-locale delete/trash with opt-in `cascadeLocales`
- [x] `AstromechConfig.locales`/`defaultLocale`, per-collection `i18n`; `entry.locales` map on all responses; `query()` `locale` option; translations via `duplicate(id, { locale, localeGroup })`
- [x] Admin: locale filter on lists, three-way create modal at non-default locale, `LocaleSwitcher`, delete confirmation with cascade checkbox + incoming-relations preview
