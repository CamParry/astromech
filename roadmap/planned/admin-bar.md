---
milestone: 1.0
---

# Admin bar

A small floating bar on the site's own pages for a signed-in user: open the
admin, edit the entry this page shows, and, when profiling is on, see what the
request spent its time on. Proposed and decided 2026-10-02. Built after
`request-performance-monitoring.md` and `permissions.md`.

Astromech sits between WordPress, where the admin and the site are one app, and
a headless CMS, where they share nothing: the site is the developer's own Astro
code, but the session carries over. The bar uses that.

## Prior art

- **WordPress's admin bar** (`WP_Admin_Bar`) shows to any signed-in user, with a
  per-user "Show Toolbar when viewing site" preference, and checks each item's
  capability ("Edit" needs `edit_post`). It never shows on REST, AJAX or embed
  requests. It finds the page's subject from the main query's queried object,
  since WordPress did the routing. It is fixed to the top and pushes the layout
  down with a 32px margin on `html`, the layout cost to avoid. Caching plugins
  skip the cache when the `wordpress_logged_in_` cookie is present.
- **Craft** stores each entry's URI from its section's URI format and resolves a
  request to its element. Its admin bar plugin requires control panel access
  and takes the entry from the template.
- **Payload's `@payloadcms/admin-bar`** checks `/me`, then links to the
  dashboard, the account, editing the current document, creating another,
  logging out and leaving preview. It is React-only, the site passes
  `collection` and `id` on every route change, and "Exit preview" shows only
  when the site passes `preview`. Across origins it needs credentialed CORS to
  `/me` and a cross-site cookie.
- **Storyblok** marks elements with `data-blok-*` attributes; **Sanity** encodes
  the source document in rendered text (stega) for click-to-edit, and across
  origins hands the site a one-time secret it checks before setting its own
  cookie.
- **Vercel's Toolbar** floats, collapses, starts asleep, and ships as one
  package or injected script for any framework. The model for delivery.

## Decided

- **The name is "admin bar"**, after WordPress's code and Payload's package.
  Rejected: "toolbar", which collides with Astro's Dev Toolbar on the same
  pages.
- **Framework-free.** One custom element, `<astromech-admin-bar>`, in shadow DOM
  so the site's styles and the bar's cannot touch each other, served by
  Astromech. Rejected: Astro's Dev Toolbar, and a component per framework.
- **Floating and collapsible**, in a corner, remembering its collapsed state
  per browser. It never changes the page's layout.
- **Who sees it:** users with `admin:access` whose "Show admin bar on the site"
  preference is on (the default), stored on `users` beside `language`
  (`locale-settings.md`). Each link checks its own permission: "Edit" shows
  only with `update` on that entry.
- **Entries only.** A global is site-wide and edited from the admin; WordPress's
  bar has no "edit header" either. So the bar does not record what a render
  read: that served only an "On this page" list of globals.
- **This page's entry**, in order:
    1. An explicit `data-astromech-entry="<id>"` attribute on any element, which
       works on static pages and in any framework.
    2. The request path matched in reverse against each entry type's `url`
       template (`/blog/{slug}`), the WordPress and Craft model. A template with a
       `{fieldName}` token matches only when that field is indexed
       (`field-value-query-indexing.md`); otherwise it is skipped.
    3. Otherwise none, and the bar offers only the admin and sign-out.

    Rejected: the first entry the render read, which a related-posts list can
    get wrong.

- **Loaded by a script on every page, never rendered by the server**
  (revised 2026-10-04 for `roadmap/planned/page-caching.md`). On a page-cache
  hit no middleware runs, so a bar the server injected would either be served
  to visitors or never appear. Sign-in sets a cookie scripts can read holding
  only "signed in"; the script loads the bar only when it is present, so an
  anonymous visitor makes no request, and it finds this page's entry by
  sending the page's path. The page itself stays the same for every visitor
  and can be cached. The same tag serves static pages and other frameworks.
- **Previews** show the bar with "Leave preview". A reviewer with only a preview
  link and no session sees nothing.

## The work

- [ ] The custom element: open the admin, edit this page's entry, create another
      of the same type, the profiler's spans when profiling is on, sign out.
- [ ] Find this page's entry: the attribute, then the reverse `url` match.
      Check whether `url` templates carry the locale (`/fr/blog/x`) and match
      it either way (`packages/astromech/src/entries/entry-url.ts`).
- [ ] Astro: the integration's middleware (`addMiddleware` in
      `packages/astromech/src/integrations/astro/integration.ts`) adds the
      `<script>` to every HTML response; the bar, the permission checks and
      the preference are resolved from the browser.
- [ ] The "signed in" cookie, set and cleared with the session, and the
      `<script>` for static pages and other frameworks, documented in
      `apps/docs`.
- [ ] The preference column on `users` and its switch on the user page, with
      `pnpm run db:generate` and the Cloudflare baseline hand-applied.

## Open questions

- **Sessions across origins.** On Astro the site and the admin share an origin
  and the cookie. A Next.js site with the admin elsewhere would not. Lean
  towards Sanity's handshake over the existing preview tokens rather than
  Payload's cross-site cookie; settle it with
  `multi-runtime-and-framework-integrations.md`.
