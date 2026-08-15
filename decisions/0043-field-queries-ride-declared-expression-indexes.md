# 0043 — Field-value queries ride declared expression indexes, not columns and not a lookup table

**Date:** 2026-08-10
**Status:** accepted

`roadmap/planned/field-value-query-indexing.md` proposed materialising declared
fields as generated columns on the shared `entries` table. That direction is
rejected. If filtering entries by a value inside their field data ever ships,
the mechanism is a **per-field declared expression index** over
`json_extract(fields, '$.path')`, with the index DDL and the query SQL emitted
from the same declaration. Filtering on an undeclared field keeps throwing
loudly (`decisions/0029-an-unknown-where-key-throws.md` is the precedent), and
table-backed entry types remain the ceiling for a type that outgrows the shared
table.

The decision rests on a survey of how fourteen CMSs store and query dynamic
fields — WordPress, Drupal, Joomla, TYPO3, Umbraco, Craft, Ghost, Strapi,
Directus, Payload, EmDash, TinaCMS, Statamic, ApostropheCMS — read from primary
sources (schemas, core source, issue trackers).

## What the survey showed

Storage designs cluster into four families, and no system survives between
them: untyped EAV (WordPress `postmeta`, Joomla `#__fields_values` — both
documented performance disasters with decade-old open tickets), real columns
generated from schema (Drupal, Strapi, Payload SQL, Directus, EmDash), one JSON
column (Craft 5, Statamic's Eloquent driver, Payload Mongo, Apostrophe), and
files with a disposable derived index (TinaCMS, Statamic flat-file).

Two findings decide this record:

- **Generated columns promoted onto a shared polymorphic table have no
  precedent.** Nobody does it. The systems that put per-field columns on one
  shared content table — Craft 2–4 — died on MySQL's 65,535-byte row limit:
  sites reached a point where they could not create another field
  (craftcms/cms #7221). Every survivor in the columns family uses
  table-per-collection, which is what Astromech's table-backed types already
  are. The open questions the roadmap file carried — the D1 100-column cap,
  column naming across types, type affinity collisions, `schema-engine` gaps —
  were symptoms of designing a mechanism no one else needed.
- **The JSON-column family's real mechanism is expression indexes.** Craft 5
  deleted its content table for a single JSON column and answers filtering with
  JSON extraction in SQL; when a query needs an index, the documented fix is a
  functional index over the exact extraction expression the query builder
  emits. SQLite supports `json_extract` in expression indexes natively — no
  columns added, no cap, no naming scheme, no row-size wall — and supports
  unique expression indexes, which is what the indexed-uniqueness item
  (`FieldReads.isUnique`) needs.

## Rejected alternatives

**Promoted generated columns** — no precedent, and every open question it
raised was self-inflicted (above).

**A typed lookup table** (`entry_id`, `field path`, `value_text` / `value_num`
/ `value_bool`). The competent version of EAV exists — Umbraco's typed
sparse-column `umbracoPropertyData` — and even Umbraco does not query it with
SQL; its answer to filtering is Lucene. Every generation of the ecosystem moved
away from EAV, and the sync machinery a value table needs (write-time
traversal, rebuild, drift detection) buys a store the database could maintain
itself through an index.

**Allowing unindexed JSON filtering by default.** Craft 5 and Statamic's
Eloquent driver both permit it — filter on anything, unindexed, scan quietly.
On D1 a scan is billed per row read against a single-threaded database, so a
silent slow success is materially worse than an error. The Firestore model
stands: an unqueryable field throws, naming the field and the remediation.

## The fragility to design around

An expression index only serves a query whose expression **textually matches**
the indexed expression — SQLite's planner compares text, not algebra, and
Craft's case-sensitivity defect (craftcms/cms #15370, binary-collated JSON
extraction) shows how the mismatch bites in practice. The mitigation is
structural: one declaration per queryable field generates both the index DDL
and the WHERE/ORDER BY SQL, the same single-source-of-truth pattern as the HTTP
route table (`decisions/0038-a-route-declares-itself.md`). Hand-written
expressions on either side are what break this; there must not be any.

## Correction to the record

The roadmap file's prior-art section attributed Directus's removal of JSON
`_contains` (9.15) to "per-database syntax divergence". Primary sources say
otherwise: PR directus/directus#14829 added operator allow-list validation,
which surfaced that `_contains` on JSON had never worked on Postgres — it was a
substring `LIKE` over serialized text that only appeared to work where JSON is
stored as text. Syntax divergence explains why the replacement (`_json` and the
driver-abstracted `json()` helper) took years, not why the removal happened.
Likewise Craft's storage trajectory is per-field columns → JSON; no EAV era
exists in primary sources.
