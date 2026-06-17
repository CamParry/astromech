/**
 * Settings service method descriptors — the declared shape + permission + effect
 * for each settings verb. The single source the HTTP transport enforces against
 * (via withPermissions) and the future method manifest reads.
 */

import type { ServiceMethodDescriptor } from '@/types/index.js';
import { setSettingSchema } from './schema.js';

export const settingsDescriptors = {
    all: {
        name: 'settings.all',
        summary: 'List all settings (full shape, for an authenticated admin).',
        permission: 'settings:read',
        mutates: false,
    },
    get: {
        name: 'settings.get',
        summary: 'Read one setting by key.',
        permission: 'settings:read',
        mutates: false,
    },
    set: {
        name: 'settings.set',
        summary: 'Create or update a setting value.',
        input: setSettingSchema,
        permission: 'settings:update',
        mutates: true,
        idempotent: true,
    },
} satisfies Record<string, ServiceMethodDescriptor>;
