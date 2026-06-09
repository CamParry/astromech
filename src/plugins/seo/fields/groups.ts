/**
 * Composition helpers (spec §3.6): field groups the user adds to an entry
 * type's `fieldGroups` to put it in the plugin's footprint.
 */

import type { FieldGroup, FieldGroupPlacement } from '@/types/index.js';
import { SEO_FIELD_NAME } from '../shared.js';

export type SeoFieldsOptions = {
    /** Where the group renders on the edit page. Default: `'tab'`. */
    placement?: FieldGroupPlacement;
    label?: string;
    priority?: number;
};

/** Field-group factory — compose into an entry type's `fieldGroups`. */
export function seoFields(options?: SeoFieldsOptions): FieldGroup {
    return {
        name: 'seo',
        label: options?.label ?? 'SEO',
        placement: options?.placement ?? 'tab',
        priority: options?.priority ?? 50,
        fields: [
            {
                name: SEO_FIELD_NAME,
                type: 'seo-meta',
                label: 'Search appearance',
            },
        ],
    };
}
