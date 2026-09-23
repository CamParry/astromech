/**
 * `seo.section()` builds its message keys in a site's config, so they must carry
 * the namespace the runtime assigns the plugin from its package name.
 */

import type { Field } from 'astromech';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { seo } from '../../src/index';

describe('seo.section', () => {
    it('prefixes every label with the namespace the runtime assigns the plugin', () => {
        const { namespace } = resolvePluginIdentity(seo());
        const labels = labelKeys([seo.section()]);

        expect(labels.length).toBeGreaterThan(0);
        expect(labels.filter((key) => !key.startsWith(`${namespace}:`))).toEqual([]);
    });

    it('stores its fields under the seo key', () => {
        expect(seo.section().name).toBe('seo');
    });

    it('takes a label in place of the default heading', () => {
        expect(seo.section({ label: 'Search' }).label).toBe('Search');
    });

    it('is typed as the site calls it, without the identity parameter', () => {
        expectTypeOf(seo.section).toEqualTypeOf<
            (options?: { label?: Field['label'] }) => Field
        >();
    });
});

/** Every label in the tree: a message key for a `t()` label, the text for a literal. */
function labelKeys(fields: Field[]): string[] {
    return fields.flatMap((field) => {
        const own =
            field.label === undefined
                ? []
                : [typeof field.label === 'string' ? field.label : field.label.$t];
        return [...own, ...labelKeys(field.fields ?? [])];
    });
}
