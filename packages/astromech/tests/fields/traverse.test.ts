/**
 * `traverseFields`: the order it visits nodes in, the schema paths and
 * ancestors it reports, `private` inheritance, and skipping a subtree.
 */

import type { FieldVisit } from '@/fields/traverse';
import type { Field } from '@/types/fields';
import { describe, expect, it } from 'vitest';
import {
    accordion,
    block,
    blocks,
    group,
    relationship,
    repeater,
    tab,
    tabs,
    text,
    tree,
} from '@/fields/builder';
import { fieldAffectsData, flattenFieldNodes, isLayoutField } from '@/fields/flatten';
import { traverseFields } from '@/fields/traverse';

function visits(fields: Field[]): FieldVisit[] {
    const out: FieldVisit[] = [];
    traverseFields(fields, (visit) => {
        out.push(visit);
    });
    return out;
}

function dataPaths(fields: Field[]): string[] {
    return visits(fields)
        .filter(({ field }) => fieldAffectsData(field))
        .map(({ schemaPath }) => schemaPath);
}

describe('traverseFields', () => {
    it('visits every node depth first, in declaration order', () => {
        const fields = [
            text('title'),
            group('meta', { fields: [text('summary')] }),
            text('footer'),
        ];
        expect(visits(fields).map(({ field }) => field.name)).toEqual([
            'title',
            'meta',
            'summary',
            'footer',
        ]);
    });

    it('reports a schema path per data field, with `[]` for each repeated scope', () => {
        const fields = [
            repeater('sections', {
                fields: [
                    text('heading'),
                    blocks('body', {
                        blocks: [
                            block('quote', { fields: [text('cite')] }),
                            block('image', { fields: [relationship('photo')] }),
                        ],
                    }),
                ],
            }),
            tree('menu', { fields: [text('label')] }),
        ];
        expect(dataPaths(fields)).toEqual([
            'sections',
            'sections[].heading',
            'sections[].body',
            'sections[].body[].cite',
            'sections[].body[].photo',
            'menu',
            'menu[].label',
        ]);
    });

    it('visits layout fields but leaves them out of the path', () => {
        const fields = [
            tabs({
                fields: [
                    tab({ label: 'Main', fields: [text('title')] }),
                    tab('seo', { fields: [text('description')] }),
                ],
            }),
            accordion({ label: 'More', fields: [text('note')] }),
        ];
        const all = visits(fields);
        expect(
            all.filter(({ field }) => isLayoutField(field)).map((v) => v.field.type)
        ).toEqual(['tabs', 'tab', 'tab', 'accordion']);
        expect(dataPaths(fields)).toEqual(['title', 'seo', 'seo.description', 'note']);
    });

    it('lists the enclosing nodes, outermost first', () => {
        const fields = [
            group({ fields: [repeater('items', { fields: [text('name')] })] }),
        ];
        const name = visits(fields).find(({ field }) => field.name === 'name');
        expect(name?.ancestors.map((node) => node.name ?? node.type)).toEqual([
            'group',
            'items',
        ]);
    });

    it('inherits `private` from a layout field or a container', () => {
        const fields = [
            group({ private: true, fields: [text('secret')] }),
            group('hidden', { private: true, fields: [text('inner')] }),
            text('open'),
        ];
        const privacy = Object.fromEntries(
            visits(fields)
                .filter(({ field }) => field.name !== undefined)
                .map(({ field, private: isPrivate }) => [field.name, isPrivate])
        );
        expect(privacy).toEqual({ secret: true, hidden: true, inner: true, open: false });
    });

    it('skips a node’s children when the visitor returns false', () => {
        const fields = [group('meta', { fields: [text('summary')] }), text('title')];
        const seen: string[] = [];
        traverseFields(fields, ({ field }) => {
            seen.push(field.name ?? field.type);
            return false;
        });
        expect(seen).toEqual(['meta', 'title']);
    });

    it('does not descend into a field that affects no data', () => {
        const rawNamedTab = { name: 'odd', type: 'tab', fields: [text('x')] } as Field;
        expect(dataPaths([rawNamedTab])).toEqual([]);
    });
});

describe('flattenFieldNodes', () => {
    it('drops a field whose type stores nothing', () => {
        const rawNamedTab = { name: 'odd', type: 'tab', fields: [] } as Field;
        expect(
            flattenFieldNodes([text('title'), rawNamedTab]).map((f) => f.name)
        ).toEqual(['title']);
    });

    it('keeps a field of an unregistered type, which may be a plugin’s', () => {
        const unknown = { name: 'stars', type: 'not-registered' } as Field;
        expect(flattenFieldNodes([unknown])).toEqual([unknown]);
    });
});
