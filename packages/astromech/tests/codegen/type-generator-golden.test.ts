import type { ResolvedConfig } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { generateClientTypes } from '@/codegen/type-generator';

/**
 * Golden baseline locking the EXACT generated output across every data field
 * type (leaves, containers, relations) in both full and public shapes. Frozen
 * on the P1a descriptor-registry commit, BEFORE the P1b codegen migration, so
 * the migration (switch -> descriptor lookups) can be proven byte-identical.
 *
 * If this snapshot changes, the codegen output changed — that is a behaviour
 * change and must be intentional, not a migration side effect.
 */
function makeConfig(
    mainFields: object[],
    extra: Record<string, unknown> = {}
): ResolvedConfig {
    return {
        entries: {
            posts: { fields: { main: mainFields as never, sidebar: [] } },
            categories: {
                fields: { main: [{ name: 'name', type: 'text' }], sidebar: [] },
            },
        },
        globals: {},
        pages: {},
        locales: [],
        defaultLocale: 'en',
        pluginEntries: {},
        ...extra,
    } as unknown as ResolvedConfig;
}

const ALL_FIELDS = [
    { name: 'fText', type: 'text' },
    { name: 'fTextarea', type: 'textarea' },
    { name: 'fRichtext', type: 'richtext' },
    { name: 'fNumber', type: 'number' },
    { name: 'fBoolean', type: 'boolean' },
    { name: 'fDate', type: 'date' },
    { name: 'fDatetime', type: 'datetime' },
    { name: 'fSelect', type: 'select' },
    { name: 'fMultiselect', type: 'multiselect' },
    { name: 'fEmail', type: 'email' },
    { name: 'fUrl', type: 'url' },
    { name: 'fColor', type: 'color' },
    { name: 'fSlug', type: 'slug' },
    { name: 'fRange', type: 'range' },
    { name: 'fCheckboxGroup', type: 'checkbox-group' },
    { name: 'fRadioGroup', type: 'radio-group' },
    { name: 'fLink', type: 'link' },
    { name: 'fKeyValue', type: 'key-value' },
    { name: 'fJson', type: 'json' },
    { name: 'fMediaSingle', type: 'media' },
    { name: 'fMediaMulti', type: 'media', multiple: true },
    { name: 'fRelSingle', type: 'relationship', target: 'categories' },
    { name: 'fRelMulti', type: 'relationship', target: 'categories', multiple: true },
    { name: 'fPrivate', type: 'text', private: true },
    {
        name: 'fGroup',
        type: 'group',
        fields: [
            { name: 'gInner', type: 'text' },
            { name: 'gSecret', type: 'number', private: true },
        ],
    },
    {
        name: 'fRepeater',
        type: 'repeater',
        fields: [
            { name: 'rLabel', type: 'text' },
            { name: 'rCount', type: 'number' },
        ],
    },
    {
        name: 'fTree',
        type: 'tree',
        fields: [{ name: 'tLabel', type: 'text' }],
    },
    { name: 'fBlocks', type: 'blocks' },
    // Layout field wrapping data fields — flattened, children keep top-level keys.
    {
        name: 'fSection',
        type: 'section',
        fields: [{ name: 'sInside', type: 'text' }],
    },
];

describe('type-generator — golden output (all field types, both shapes)', () => {
    it('emits identical output for the full field matrix', () => {
        const output = generateClientTypes(makeConfig(ALL_FIELDS));
        expect(output).toMatchSnapshot();
    });
});
