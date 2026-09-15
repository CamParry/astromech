/**
 * `seoSection()` builds its message keys in a site's config, so they must carry
 * the namespace the runtime assigns the plugin from its package name.
 */

import type { Field } from 'astromech';
import { pluginNamespace } from 'astromech';
import { describe, expect, it } from 'vitest';
import { seo, seoSection } from '../../src/index';

describe('seoSection', () => {
    it('prefixes every label with the namespace the runtime assigns the plugin', () => {
        const namespace = pluginNamespace(seo().package);
        const labels = labelKeys([seoSection()]);

        expect(labels.length).toBeGreaterThan(0);
        expect(labels.filter((key) => !key.startsWith(`${namespace}:`))).toEqual([]);
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
