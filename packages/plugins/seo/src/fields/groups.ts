/**
 * Composition helper: returns a `group(...)` Field the user composes
 * into an entry type's `fields` array. The group namespaces its data under
 * `SEO_FIELD_NAME` (preserving the `{ title, description }` stored shape) and is
 * built from core `text`/`textarea` fields plus a presentational preview.
 */

import type { Field, Label, MessageRef } from 'astromech';
import { pluginNamespace, t } from 'astromech';
import { group, text, textarea } from 'astromech/fields';
import { SEO_FIELD_NAME, SEO_PACKAGE } from '../types';
import { SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE } from '../utilities/length';

export type SeoSectionOptions = { label?: Label };

/**
 * A site builds this section in its config, before any plugin runtime exists,
 * so the namespace comes from the package name, derived the way the runtime
 * derives it. It pins message keys to this plugin's bundle.
 */
const NAMESPACE = pluginNamespace(SEO_PACKAGE);

function tKey(key: string): MessageRef {
    return t(`${NAMESPACE}:${key}`);
}

/**
 * Field-section factory — compose into an entry type's `fields`. Returns a
 * titled `group` that stores its fields under `SEO_FIELD_NAME`.
 */
export function seoSection(options?: SeoSectionOptions): Field {
    return group(SEO_FIELD_NAME, {
        label: options?.label ?? tKey('seo.sectionTitle'),
        fields: [
            text('title', {
                label: tKey('field.titleLabel'),
                count: SEO_TITLE_RANGE,
            }),
            textarea('description', {
                label: tKey('field.descriptionLabel'),
                count: SEO_DESCRIPTION_RANGE,
            }),
            {
                name: 'preview',
                type: 'seo-preview',
                label: tKey('field.previewCaption'),
            },
        ],
    });
}
