/**
 * `seo.section()` builds its message keys in a site's config, so they must carry
 * the namespace the runtime assigns the plugin from its package name.
 */

import type { Field } from 'astromech';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { describe, expect, it } from 'vitest';
import { seo } from '../../src/index';

describe('seo.section', () => {
    it('prefixes every label with the namespace the runtime assigns the plugin', async () => {
        const { adminConfig } = await createPluginTestApp('seo', {
            ...makeTestConfig(),
            plugins: [seo()],
        });
        const namespace = adminConfig.plugins.find(
            ({ serviceKey }) => serviceKey === 'seo'
        )?.namespace;
        expect(namespace).toBe('seo');
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
