/**
 * Unit tests for the snapshot serialiser (`database/snapshot.ts`).
 *
 * Covers shape, determinism (same input → identical serialized output
 * regardless of input order, since tables are sorted by name), synthesized
 * unique indexes being included, and app-side-only facts (`appDefault`,
 * `onUpdate`, `serialize`/`parse`) being excluded from column snapshots.
 */

import { describe, expect, it } from 'vitest';
import { createSnapshot, serializeSnapshot } from '@/database/snapshot.js';
import { roles } from '@/users/schema.js';
import { entries, entryPreviewTokens } from '@/entries/schema.js';
import { relationships, cron } from '@/database/schema.js';

describe('createSnapshot', () => {
    it('has the expected top-level shape, tables keyed + sorted by name', () => {
        const snapshot = createSnapshot([entries, roles], { dialect: 'sqlite' });
        expect(snapshot.version).toBe(1);
        expect(snapshot.dialect).toBe('sqlite');
        expect(Object.keys(snapshot.tables)).toEqual(['entries', 'roles']);
    });

    it('includes the synthesized column-unique index', () => {
        const snapshot = createSnapshot([entryPreviewTokens], { dialect: 'sqlite' });
        expect(snapshot.tables.entry_preview_tokens?.indexes).toContainEqual({
            name: 'entry_preview_tokens_token_unique',
            columns: ['token'],
            unique: true,
        });
    });

    it('resolves foreign keys to their target table + column', () => {
        const snapshot = createSnapshot([entries], { dialect: 'sqlite' });
        expect(snapshot.tables.entries?.fks).toContainEqual({
            column: 'staged_for',
            targetTable: 'entries',
            targetColumn: 'id',
            onDelete: 'no action',
        });
        expect(snapshot.tables.entries?.fks).toContainEqual({
            column: 'created_by',
            targetTable: 'users',
            targetColumn: 'id',
            onDelete: 'no action',
        });
    });

    it('carries enum values on enum columns', () => {
        const snapshot = createSnapshot([relationships], { dialect: 'sqlite' });
        const sourceType = snapshot.tables.relationships?.columns.find(
            (c) => c.key === 'sourceType'
        );
        expect(sourceType?.enumValues).toEqual(['entry', 'user', 'media']);
    });

    it('excludes app-side-only facts (appDefault, onUpdate, serialize, parse) from columns', () => {
        const snapshot = createSnapshot([roles], { dialect: 'sqlite' });
        const createdAt = snapshot.tables.roles?.columns.find(
            (c) => c.key === 'createdAt'
        );
        expect(createdAt).toBeDefined();
        expect(Object.keys(createdAt ?? {}).sort()).toEqual(
            ['key', 'name', 'kind', 'notNull', 'primaryKey', 'type'].sort()
        );
    });
});

describe('serializeSnapshot', () => {
    it('is deterministic — identical output for identical input regardless of table order', () => {
        const a = serializeSnapshot(
            createSnapshot([roles, entries, cron], { dialect: 'sqlite' })
        );
        const b = serializeSnapshot(
            createSnapshot([cron, entries, roles], { dialect: 'sqlite' })
        );
        expect(a).toBe(b);
    });
});
