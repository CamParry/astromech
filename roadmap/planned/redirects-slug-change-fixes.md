# Redirects: slug-change fixes

The test-suite trust work added the redirects plugin's first real tests, and
they turned up two defects in the slug-change hook and two smaller ones in
`lookup`.

## What is wrong

- **An incomplete URL redirects the home page.** `resolveEntryUrl` in
  `packages/astromech/src/entries/entry-url.shared.ts` replaces an empty token
  with an empty string, so `/{category}/{slug}` with no category becomes
  `//hello`. `resolveEntryPath` parses that as a protocol-relative URL whose host
  is `hello`, and answers `/`. Setting the category then records the rule
  `/` to `/news/hello`. The seo plugin's sitemap reads the same path.
- **Changing a slug back creates a loop.** `a` to `b` to `a` leaves two enabled
  rules, `/blog/a` to `/blog/b` and `/blog/b` to `/blog/a`, so the live page
  redirects away and back. Chains are never flattened either, so `a` to `b` to
  `c` takes two hops.
- **`lookup` reads every rule on every request** and matches in memory, where
  `tableRepository` can filter on the `from` column.
- **`lookup` re-parses its own input**, which the method's `input` schema has
  already parsed.

## Decisions

- **An entry with an empty URL token has no URL.** `resolveEntryUrl` and
  `resolveEntryPath` answer null, so the admin "View" link, menus, the sitemap
  and the hook all skip it rather than use a wrong path.
- **Recording `from` to `to` keeps the rule set loop-free and one hop deep**, as
  WordPress's Redirection plugin and Yoast do: an enabled rule whose `from` is
  the new `to` is deleted (that path is live again), and an enabled rule whose
  `to` is the old `from` is repointed to the new `to`.

## The work

- [ ] `resolveEntryUrl` and `resolveEntryPath` answer null for an empty token,
      with tests, and their callers handle it.
- [ ] The hook deletes the rule the new path would loop through and repoints
      chains, with tests.
- [ ] `lookup` filters on `from` in the query and stops re-parsing its input.
- [ ] The redirects README describes the loop and chain handling.
