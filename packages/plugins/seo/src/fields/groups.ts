/**
 * Composition helper: returns a `group(...)` FieldDefinition the user composes
 * into an entry type's `fields` array. The group namespaces its data under
 * `SEO_FIELD_NAME` (preserving the `{ title, description }` stored shape) and is
 * built from core `text`/`textarea` fields plus a presentational preview.
 */

import { group, section, text, textarea } from 'astromech/fields';
import { t } from 'astromech';
import type { FieldDefinition, Label, MessageDescriptor } from 'astromech';
import { SEO_FIELD_NAME } from '../types.js';
import { SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE } from '../utilities/length.js';

export type SeoSectionOptions = { label?: Label };

/**
 * `seoSection()` is host-facing: a site calls it directly from its own
 * entry-type config, before any plugin runtime exists, so there is no
 * `PluginContext` to read `ctx.plugin.namespace` from. `NAMESPACE` is a
 * deliberate package-local stand-in for that — the real fix is hanging
 * host-facing helpers off the plugin factory (`seo.section()`), tracked as
 * Phase 3 in roadmap/in-progress/plugin-authoring-experience.md. The
 * `@astromech/seo` → `seo` derivation is stable and collision-checked at
 * resolve time, so hand-writing it here is safe, just not elegant.
 *
 * Plugin labels are composed into arbitrary entry types (including core
 * ones), so a bare `t('seo.x')` would resolve against the host entry's
 * namespace and miss. Prefixing with the namespace (`seo:seo.x`) pins
 * resolution to this plugin's bundle regardless of where the section is
 * mounted.
 */
const NAMESPACE = 'seo';

function tKey(key: string): MessageDescriptor {
    return t(`${NAMESPACE}:${key}`);
}

/**
 * Field-section factory — compose into an entry type's `fields`. Renders a
 * titled `section` (the visible panel) wrapping an unboxed `group` that
 * namespaces the data under `SEO_FIELD_NAME` (the `{ title, description }`
 * stored shape). The group carries the data key; the section is presentational.
 */
export function seoSection(options?: SeoSectionOptions): FieldDefinition {
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
