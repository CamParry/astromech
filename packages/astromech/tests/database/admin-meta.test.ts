/**
 * Unit tests for the admin metadata projection (`database/admin-meta.ts`).
 *
 * Covers the kind → {cellKind, fieldType} mapping for every `ColumnKind`,
 * `enumValues` being carried through for enum columns, and `referenceTable`
 * being resolved for reference columns.
 */

import { describe, expect, it } from 'vitest';
import { tableAdminMeta } from '@/database/admin-meta';
import { defineTable } from '@/database/define-table';

const target = defineTable('target', ({ col }) => ({ id: col.id() }));

const fixture = defineTable('fixture', ({ col }) => ({
    id: col.id(),
    label: col.text({ notNull: true }),
    count: col.integer(),
    ratio: col.real(),
    active: col.boolean({ notNull: true }),
    when: col.timestamp({ notNull: true }),
    data: col.json(),
    kind: col.enum(['a', 'b'], { notNull: true }),
    owner: col.reference(() => target),
}));

describe('tableAdminMeta', () => {
    it('projects every column kind to its cellKind + fieldType, in declaration order', () => {
        expect(tableAdminMeta(fixture)).toEqual([
            { name: 'id', cellKind: 'text', fieldType: 'text', nullable: false },
            { name: 'label', cellKind: 'text', fieldType: 'text', nullable: false },
            { name: 'count', cellKind: 'number', fieldType: 'number', nullable: true },
            { name: 'ratio', cellKind: 'number', fieldType: 'number', nullable: true },
            {
                name: 'active',
                cellKind: 'boolean',
                fieldType: 'boolean',
                nullable: false,
            },
            { name: 'when', cellKind: 'date', fieldType: 'datetime', nullable: false },
            { name: 'data', cellKind: 'text', fieldType: 'json', nullable: true },
            {
                name: 'kind',
                cellKind: 'badge',
                fieldType: 'select',
                nullable: false,
                enumValues: ['a', 'b'],
            },
            {
                name: 'owner',
                cellKind: 'relationship',
                fieldType: 'relationship',
                nullable: true,
                referenceTable: 'target',
            },
        ]);
    });

    it('projects a timestamp as a datetime field', () => {
        const withStamp = defineTable('withStamp', ({ col }) => ({
            id: col.id(),
            createdAt: col.timestamp({ notNull: true }),
        }));
        expect(tableAdminMeta(withStamp)).toContainEqual({
            name: 'createdAt',
            cellKind: 'date',
            fieldType: 'datetime',
            nullable: false,
        });
    });

    it('resolves referenceTable for a string reference target', () => {
        const withUserRef = defineTable('withUserRef', ({ col }) => ({
            id: col.id(),
            createdBy: col.reference('users'),
        }));
        const meta = tableAdminMeta(withUserRef);
        expect(meta.find((m) => m.name === 'createdBy')?.referenceTable).toBe('users');
    });
});
