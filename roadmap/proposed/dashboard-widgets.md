# Dashboard widgets

The dashboard is fixed. Plugins add whole pages (the SEO overview is one) and
fill the toolbar, right drawer and global overlay slots
(`packages/admin/src/components/plugins/plugin-slot.tsx`), but cannot add to
the dashboard. Raised on 2026-10-03. **Target: 1.0.**

## Prior art

- **Payload:** customisable dashboards were its top-voted RFC (121), shipped in
  3.69.
- **Strapi:** homepage customisation (357 votes), shipped.
- **Directus Insights** and **WordPress dashboard widgets.**

## Proposal

- A dashboard slot that plugins and the site fill with widgets, each with a
  size and an order set in config.
- Widgets respect permissions: one a user cannot use is not shown.
- Arranging widgets per user waits until after 1.0.

## Open questions

- Which widgets ship in core: recent entries, scheduled entries, the status
  screen's warnings (`roadmap/proposed/status-screen.md`)?
- Is a widget a React component only, or can it be declared from data, like a
  count of entries?
