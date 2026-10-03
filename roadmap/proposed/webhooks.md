# Webhooks

Call an outside URL when content changes: a deploy hook that rebuilds a static
site, a search index, or another service. Raised on 2026-10-03. **Target:
after 1.0**, as a first-party plugin once `roadmap/planned/hooks.md` lands.

## Prior art

- **Strapi**, **Directus** (Flows), **Sanity** (filtered by GROQ),
  **Contentful** and **Storyblok** ship webhooks in core.
- **Payload** has none: its hooks are code.
- Static sites on Netlify, Vercel or Cloudflare Pages rebuild from a deploy
  hook, so a site built ahead of time (`roadmap/proposed/page-caching.md`)
  needs one.

## Open questions

- Are webhooks configured in code or in the admin (a global)?
- Retries, signing and a delivery log: which ship first?
- Does the forms plugin's "generic webhook" notification provider
  (`roadmap/backlog.md`) become one of these?
