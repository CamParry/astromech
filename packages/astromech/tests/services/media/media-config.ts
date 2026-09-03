/**
 * The config the translatable-media tests are written against: two locales and a
 * media schema with one per-locale field and one that belongs to the item.
 */

import type { AstromechConfig } from '@/types/index';
import { makeTestConfig } from '@tests/harness';

export function makeTranslatableMediaConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        locales: ['en', 'fr'],
        defaultLocale: 'en',
        media: {
            translatable: true,
            fields: [
                { name: 'credit', type: 'text', label: 'Credit' },
                // Belongs to the file, not to one of its locales.
                {
                    name: 'internalRef',
                    type: 'text',
                    label: 'Internal reference',
                    translatable: false,
                },
            ],
        },
    };
}
