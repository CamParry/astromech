/**
 * Composition helper: returns a `group(...)` Field the user composes
 * into an entry type's `fields` array. The group namespaces its data under
 * `SEO_FIELD_NAME` (preserving the `{ title, description }` stored shape) and is
 * built from core `text`/`textarea` fields plus a presentational preview.
 */

import type { Field, Label, MessageRef } from 'astromech';
import { t } from 'astromech';
import { group, section, text, textarea } from 'astromech/fields';
import { SEO_FIELD_NAME } from '../types';
import { SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE } from '../utilities/length';

export type SeoSectionOptions = { label?: Label };

/**
 * `seoSection()` is host-facing: a site calls it from its own entry-type
 * config, before any plugin runtime exists, so there is no `PluginContext` to
 * read the namespace from. Prefixing keys with it pins message resolution to
 * this plugin's bundle regardless of which entry type the section is mounted on.
 */
const NAMESPACE = 'seo';

function tKey(key: string): MessageRef {
    return t(`${NAMESPACE}:${key}`);
}

/**
 * Field-section factory — compose into an entry type's `fields`. Renders a
 * titled `section` wrapping an unboxed `group` that namespaces the data
 * under `SEO_FIELD_NAME`; the group carries the data key, the section presents.
 */
export function seoSection(options?: SeoSectionOptions): Field {
    return section('seoSection', {
        label: options?.label ?? tKey('seo.sectionTitle'),
        fields: [
            group(SEO_FIELD_NAME, {
                boxed: false,
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
            }),
        ],
    });
}
