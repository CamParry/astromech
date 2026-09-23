/**
 * The `seo.section()` plugin helper: a titled `group` a site composes into an
 * entry type's `fields`. It stores its fields under `SEO_FIELD_NAME` and labels
 * them with message keys in the plugin's namespace.
 */

import type { Field, Label, ResolvedPluginIdentity } from 'astromech';
import { t } from 'astromech';
import { group, text, textarea } from 'astromech/fields';
import { SEO_FIELD_NAME } from '../types';
import { SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE } from '../utilities/length';

export type SeoSectionOptions = { label?: Label };

/** Build the SEO field group. `definePlugin` supplies `plugin`; a site passes `options`. */
export function section(
    plugin: ResolvedPluginIdentity,
    options?: SeoSectionOptions
): Field {
    const label = (key: string) => t(`${plugin.namespace}:${key}`);
    return group(SEO_FIELD_NAME, {
        label: options?.label ?? label('seo.sectionTitle'),
        fields: [
            text('title', {
                label: label('field.titleLabel'),
                count: SEO_TITLE_RANGE,
            }),
            textarea('description', {
                label: label('field.descriptionLabel'),
                count: SEO_DESCRIPTION_RANGE,
            }),
            {
                name: 'preview',
                type: 'seo-preview',
                label: label('field.previewCaption'),
            },
        ],
    });
}
