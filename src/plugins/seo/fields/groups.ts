/**
 * Composition helper: returns a `group(...)` FieldDefinition the user composes
 * into an entry type's `fields` array. The group namespaces its data under
 * `SEO_FIELD_NAME` (preserving the `{ title, description }` stored shape) and is
 * built from core `text`/`textarea` fields plus a presentational preview.
 */

import { group, section, text, textarea } from '@/builders/fields.js';
import type { FieldDefinition, Label } from '@/types/index.js';
import { tKey } from '../manifest.js';
import { SEO_FIELD_NAME } from '../types.js';
import { SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE } from '../utilities/length.js';

export type SeoSectionOptions = { label?: Label };

/**
 * Field-section factory — compose into an entry type's `fields`. Renders a
 * titled `section` (the visible panel) wrapping a container-less `group` that
 * namespaces the data under `SEO_FIELD_NAME` (the `{ title, description }`
 * stored shape). The group carries the data key; the section carries the chrome.
 */
export function seoSection(options?: SeoSectionOptions): FieldDefinition {
    return section('seoSection', {
        label: options?.label ?? tKey('seo.sectionTitle'),
        fields: [
            group(SEO_FIELD_NAME, {
                container: false,
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
