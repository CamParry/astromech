/**
 * Demo plugin exercising `registerFieldType`: a 1-5 star rating field with a
 * renderer, validator, defaultValue, and typeGen contribution.
 */

import { fileURLToPath } from 'node:url';
import { definePlugin } from 'astromech';

export const rating = definePlugin(() => ({
    package: 'demo-rating',
    version: '1.0.0',
    permissions: [{ key: 'view', label: 'View rating reports' }],
    fields: [
        {
            type: 'rating',
            component: fileURLToPath(new URL('./rating-field.tsx', import.meta.url)),
            defaultValue: 0,
            typeGen: () => 'number',
        },
    ],
    admin: {
        nav: [
            {
                label: 'Ratings',
                icon: 'Star',
                permission: 'plugin:demo-rating:view',
                children: [{ label: 'Overview', to: '/entries/page', icon: 'ChartBar' }],
            },
        ],
    },
}));
