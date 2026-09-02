/**
 * The globals the service tests are written against. One per capability
 * combination, so a test names the global whose declaration it is exercising
 * rather than mutating a shared one.
 */

import type { AstromechConfig, GlobalConfig } from '@/types/index';
import { makeTestConfig } from '@tests/harness';

/**
 * - `site`: translatable, public, staging and versioning on — the full surface,
 *   with a shared field, a private field and a required field.
 * - `contact`: not translatable, no staging — the default shape.
 * - `theme`: versioning off.
 * - `banner`: statuses off, so it is never gated on publication.
 * - `legal`: public, with the same defaults as `contact`.
 * - `announcement`: staging on, with a required field, for the merge gate.
 */
export function testGlobals(): GlobalConfig[] {
    return [
        {
            key: 'site',
            label: 'Site',
            translatable: true,
            public: true,
            staging: true,
            fields: [
                { name: 'title', type: 'text', label: 'Title' },
                // Belongs to the global, not to one of its locales.
                { name: 'brand', type: 'text', label: 'Brand', translatable: false },
                { name: 'secret', type: 'text', label: 'Secret', private: true },
            ],
        },
        {
            key: 'contact',
            label: 'Contact',
            fields: [
                { name: 'email', type: 'text', label: 'Email' },
                { name: 'phone', type: 'text', label: 'Phone' },
            ],
        },
        {
            key: 'theme',
            label: 'Theme',
            versioning: false,
            fields: [{ name: 'accent', type: 'text', label: 'Accent' }],
        },
        {
            key: 'banner',
            label: 'Banner',
            statuses: false,
            fields: [{ name: 'message', type: 'text', label: 'Message' }],
        },
        {
            key: 'legal',
            label: 'Legal',
            public: true,
            fields: [{ name: 'terms', type: 'text', label: 'Terms' }],
        },
        {
            key: 'announcement',
            label: 'Announcement',
            staging: true,
            fields: [
                { name: 'headline', type: 'text', label: 'Headline', required: true },
                { name: 'body', type: 'text', label: 'Body' },
            ],
        },
    ];
}

/** The harness config with the globals above declared on it. */
export function makeGlobalsConfig(): AstromechConfig {
    return { ...makeTestConfig(), globals: testGlobals() };
}
