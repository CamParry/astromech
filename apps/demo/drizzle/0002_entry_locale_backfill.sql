-- Backfill: set explicit locale on all entries that currently have locale = NULL.
-- These are source/non-translated entries. Replace 'en' if your defaultLocale differs.
UPDATE entries SET locale = 'en' WHERE locale IS NULL;
