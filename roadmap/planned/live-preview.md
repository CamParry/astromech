---
milestone: 1.0
---

# Side-by-side live preview

Preview opens saved content in a new tab
(`packages/astromech/src/entries/methods/preview/issue-token.ts`). There is no
preview beside the form that follows the editor's unsaved changes. Raised on
2026-10-03; decided the same day.

## Prior art

- **Payload** posts form data into the frame through `postMessage`, which needs
  React on the site; **Craft** autosaves a draft and reloads the frame.
- **Storyblok's Astro SDK** and **Tina with Astro** POST the unsaved data to
  the page's own URL; middleware renders from it and a script swaps the new
  HTML in (morphdom), keeping scroll and state.
- **Statamic** restores the scroll position after a reload, same origin only.
- Device sizes: Payload `breakpoints`, Statamic `devices`.

## Decided (2026-10-03)

- **The admin POSTs the unsaved form to the page.** A hidden form with the
  preview frame as its `target` sends the entry id, locale and field values to
  the page's own URL. Astromech's middleware checks the admin session, `update`
  on that entry and a same-origin request, then puts the values in the request
  scope. Nothing is saved.
- **The site's code does not change.** Any read of that entry in that request
  (`get` or `query`) returns the posted values in the public shape, so lists on
  the same page show the change too.
- **The frame reloads** with each update, debounced by 500 ms with an in-flight
  request aborted; the admin restores the scroll position (same origin).
  Swapping the HTML in place without a reload (morphdom) comes after 1.0.
- **The URL is the entry type's `url` template.** Several named preview
  targets per type come later. Globals have no preview in 1.0.
- **Desktop, tablet and mobile widths**, fixed in 1.0.
- **Preview responses are never cached**, and a page built ahead of time cannot
  be previewed (it never sees the POST).
- Shareable preview links stay as they are, showing the saved draft.

## The work

- [ ] The middleware: the POST check and the request-scope override.
- [ ] The entries service returning the override for that entry on `get` and
      `query`.
- [ ] The admin: the preview pane, the hidden form, debounce and abort, scroll
      restore, device widths.
- [ ] `frame-ancestors 'self'` on the admin page
      (`roadmap/planned/core-security.md`); the docs on what a site needs.

## Testing

A POST without a session or without `update` renders the saved page; a POST
with both renders the posted title in the entry and in a list on the same page;
nothing is written; a cross-origin POST is refused.
