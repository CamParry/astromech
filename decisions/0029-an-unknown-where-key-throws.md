# 0029 — An unknown entries-list `where` key throws

**Date:** 2026-08-08
**Status:** accepted

`buildListWhere` (`entries/storage/built-in.ts`) matched `locale`, `_search`,
`status`, `slug`, `title`, `id` and `references`, and had no `else`. Every other
key was iterated and discarded. A caller filtering on something the builder did
not recognise got **every row back, with a `total` and `pages` to match**, and no
signal that anything had been ignored.

It now throws `UnknownWhereKeyError`, naming the offending key and pointing at
the relation-filter shape. This is breaking.

## Why throw rather than keep dropping

A silent drop fails in the worst direction available. The caller gets a
plausible, fully-formed, wrong answer: a list page that renders, paginates and
looks correct while showing unfiltered content. Nothing downstream can detect it,
because a superset is indistinguishable from a correct result without knowing
what was asked for.

It had already produced exactly that. `apps/demo`'s category and tag archives
passed `where: { category: id }` and `where: { tags: id }` and had been showing
every post — found by counting links on the rendered pages, not by any test.

The descriptor-driven storage wrapper on the other side of the codebase
(`entries/storage/table.ts`) already throws on an unknown key. Two `where` DSLs
in one codebase disagreeing about whether a typo is an error is worse than either
policy on its own.

## Rejected

**Warn instead of throw.** The wrong results appear in server-rendered output
where nobody is reading a log, which is the same failure with extra steps. A
warning is the right shape when a caller can still get correct output; here they
cannot.

**Wait for field-value query indexing.** The reasoning recorded in `backlog.md`
was that throwing would turn the demo's archive pages into errors until
JSON-field filtering shipped. That was true only of throwing _without_ fixing the
caller. The demo's two reads were rewritten onto `where: { references }` — which
the relationships index already supported and which nothing in production had
used yet — and the throw then had no reachable caller at all. A scan of `apps/`
and `packages/` found those two lines were the only ones in the repo passing an
unrecognised key.

## What this does not decide

Whether filtering on an **undeclared scalar field** (`where: { featured: true }`)
should fail loudly with a remediation hint, or be made to work. That is the
subject of `roadmap/planned/field-value-query-indexing.md` and is untouched here:
this record is only about a key the builder cannot interpret at all.
