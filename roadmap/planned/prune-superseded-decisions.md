# Prune superseded decisions

The compact pass (2026-08-24) reduced every record in `decisions/` to a 1-3 line
description. This is the follow-up: decide which superseded records to remove or
merge, and mark the ones that have gone partially stale. Removal needs a call on
relaxing the append-only rule in `decisions/README.md` first.

## Remove or merge (fully superseded, no surviving rationale)

- [ ] 0067 and 0068, intermediate steps of the probe-rename chain that ends at
      0072; 0069 carries the surviving build-sequence content
- [ ] 0055 and 0076, both folded into 0080
- [ ] 0053, placement superseded by 0059
- [ ] 0036, superseded by 0070; only the `*.shared.ts` origin survives and 0084
      already retells it
- [ ] 0057, largely reversed by 0062, 0063 and 0064; removing it orphans 0063,
      so if pruned, merge the pair into one record

## Flag as partially stale (mark, do not remove)

- [ ] 0007: its claim that `astromech/ui` loads under plain Node was corrected
      by 0041, and the plugin import surface has since changed (0062)
- [ ] 0009: the "client" noun was defined around `AstromechClient`, deleted by
      0062 (the REST `astromechClient` survives)
- [ ] 0039: moved `AstromechClient`, which 0062 later deleted; carries no
      superseded marker
- [ ] 0003: omnibus record; the no-repository point fell to 0075 and the
      `storage` vocabulary to 0075 and 0092, while the migration-generator locks
      still stand
- [ ] 0028: the call-site-visibility point fell to 0076 and then 0080; the
      D1-degrades-rather-than-refusing-to-boot principle stands

## Mechanical defects

- [ ] Two files share number 0075 (`0075-repository-for-data-access.md` and
      `0075-tables-split-from-domain-schema.md`), violating "numbers are unique
      and never reused"; renumber one and update inbound links
- [x] 0053 lacked its `superseded by 0059` status (fixed in the compact pass)

Before removing any record, check inbound links: many `roadmap/completed/`
files and some decisions link to decision records, and `check:docs` fails on a
dangling link.
