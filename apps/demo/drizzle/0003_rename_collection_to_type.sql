ALTER TABLE entries RENAME COLUMN collection TO type;

DROP INDEX IF EXISTS idx_entries_collection;
DROP INDEX IF EXISTS idx_entries_slug;
DROP INDEX IF EXISTS idx_entries_status;
DROP INDEX IF EXISTS idx_entries_locale;

CREATE INDEX idx_entries_type ON entries(type);
CREATE INDEX idx_entries_slug ON entries(type, slug);
CREATE INDEX idx_entries_status ON entries(type, status);
CREATE INDEX idx_entries_locale ON entries(type, locale, status);
