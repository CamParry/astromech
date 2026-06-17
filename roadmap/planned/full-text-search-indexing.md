# Full-Text Search Indexing

- [ ] Add `search_index` text column to `entriesTable`
- [ ] `searchable?: false` per field in `FieldConfig` to exclude fields from the index
- [ ] Rebuild index on entry save; `astromech entries:reindex` CLI command for backfilling
- [ ] Switch search to query the `search_index` column
