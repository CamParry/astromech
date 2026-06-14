/**
 * Composition helper: returns a `section(...)` FieldDefinition the user
 * composes into an entry type's `fields` array to attach the seo-meta field.
 */

import { section, t } from '@/builders/fields.js';
import type { FieldDefinition, Label } from '@/types/index.js';
import { SEO_FIELD_NAME } from '../shared.js';

export type SeoSectionOptions = { label?: Label };

/** Field-section factory — compose into an entry type's `fields`. */
export function seoSection(options?: SeoSectionOptions): FieldDefinition {
    return section('seo', {
        label: options?.label ?? t('seo.sectionTitle'),
        fields: [
            {
                name: SEO_FIELD_NAME,
                type: 'seo-meta',
                label: t('seo.fieldLabel'),
            },
        ],
    });
}
