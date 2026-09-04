/**
 * The config the translatable-users tests are written against: two locales and a
 * user schema with one per-locale field and one that belongs to the person.
 */

import type { AstromechConfig } from '@/types/index';
import { makeTestConfig } from '@tests/harness';

export function makeTranslatableUsersConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        locales: ['en', 'fr'],
        defaultLocale: 'en',
        users: {
            translatable: true,
            fields: [
                { name: 'bio', type: 'text', label: 'Bio' },
                // Belongs to the person, not to one of their locales.
                {
                    name: 'staffId',
                    type: 'text',
                    label: 'Staff ID',
                    translatable: false,
                },
            ],
        },
    };
}
