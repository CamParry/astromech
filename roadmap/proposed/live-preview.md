# Side-by-side live preview

Preview tokens open saved content in a new tab
(`packages/astromech/src/entries/methods/preview/issue-token.ts`). There is no
preview beside the form that follows the editor's changes. Raised on
2026-10-03. **Target: 1.0.** Depends on `roadmap/proposed/autosave.md`.

## Prior art

- **Payload 2.0** (2023) and **Sanity's Presentation tool** (2023) added it;
  it was the headline of **Kirby 5**; **Strapi** charges for it and keeps the
  new-tab preview free.
- **Craft** saves a provisional draft and reloads the preview frame, so the
  site needs no client library. **Payload** posts form data into the frame,
  which needs React on the site.

## Proposal

Craft's model. The site and the admin share one server, so the frame loads the
real page with a preview token:

- A preview pane beside the form, showing the entry's `url`, with device
  widths.
- Each autosave reloads the frame with a preview token for the draft or the
  staged changes.
- No client library on the site.

## Open questions

- Which pages can be previewed: only entries with a `url` template, or any page
  the site names?
- How does the frame keep its scroll position across reloads?
- How does it work once the site is on another origin
  (`roadmap/proposed/multi-runtime-and-framework-integrations.md`)?
