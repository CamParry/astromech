# Admin bar

A small floating bar on the site's own pages for a signed-in user: open the
admin, edit what this page shows, and, when profiling is on, see what the
request spent its time on. Proposed 2026-10-02.

Astromech sits between WordPress, where the admin and the site are one app, and
a headless CMS, where they share nothing: the site is the developer's own Astro
code, but the session carries over. The bar uses that.

## Prior art

- **WordPress's admin bar** (`WP_Admin_Bar`) is fixed to the top and pushes the
  layout down with a 32px top margin on `html`. The layout cost is what to
  avoid.
- **Payload's `@payloadcms/admin-bar`** checks `/me`, then links to the
  dashboard, the account, editing the current document, creating another,
  logging out and leaving preview. It is React-only, and the site passes
  `collection` and `id` on every route change.
- **Vercel's Toolbar** floats, collapses, starts asleep, and ships as one
  package or injected script for any framework. The model for delivery.
- **Sanity's visual editing** maps rendered text to a document and field with
  invisible characters (stega) for click-to-edit. Out of scope for a first
  version.

## Decided

- **The name is "admin bar"**, after WordPress's code and Payload's package.
  Rejected: "toolbar", which collides with Astro's Dev Toolbar on the same
  pages.
- **Framework-free.** One custom element, `<astromech-admin-bar>`, in shadow DOM
  so the site's styles and the bar's cannot touch each other, served by
  Astromech. Rejected: Astro's Dev Toolbar, and a component per framework.
- **Floating and collapsible**, in a corner, remembering its collapsed state
  per browser. It never changes the page's layout.
- **The page says nothing for the bar to work.** The request scope records the
  entries and globals the render read, the profiler's `method` spans
  (`request-performance-monitoring.md`), and the bar offers to edit the main one
  and lists the rest. A site can name the subject with an attribute, as
  Payload's props do.

## The work

- [ ] Record the resources a render reads in the request scope.
- [ ] The custom element: open the admin, edit this page's entry or global,
      create another of the same type, the profiler's spans when profiling is
      on, sign out.
- [ ] Astro: the integration's middleware (`addMiddleware` in
      `packages/astromech/src/integrations/astro/integration.ts`) injects the
      tag into HTML responses for a signed-in session only, so an anonymous
      visitor gets nothing.
- [ ] Other frameworks: one `<script>` tag, documented in `apps/docs`.

## Open questions

- **Sessions across origins.** On Astro the site and the admin share an origin
  and the cookie. A Next.js site with the admin elsewhere would not; settle it
  with `multi-runtime-and-framework-integrations.md`.
- **Who sees it.** Any signed-in user, or roles holding a permission.
- **Previews.** Whether it shows on a preview-token view of unpublished content,
  and offers to leave the preview.
