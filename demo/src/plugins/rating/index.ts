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
    i18n: {
        en: fileURLToPath(new URL('./locales/en.json', import.meta.url)),
    },
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
                children: [
                    {
                        label: 'Overview',
                        to: '/plugin/demo-rating/overview',
                        icon: 'ChartBar',
                    },
                    {
                        label: 'Settings',
                        to: '/plugin/demo-rating/settings',
                        icon: 'Settings',
                    },
                ],
            },
        ],
        pages: [
            {
                path: '/overview',
                component: fileURLToPath(new URL('./overview-page.tsx', import.meta.url)),
                label: 'Ratings Overview',
                permission: 'plugin:demo-rating:view',
            },
        ],
        settings: {
            fields: [
                {
                    name: 'minimumQuality',
                    type: 'number',
                    label: 'Minimum quality to publish',
                    description: 'Pages below this rating show a warning.',
                },
                {
                    name: 'showInListing',
                    type: 'boolean',
                    label: 'Show ratings in entry lists',
                },
            ],
        },
    },
}));
