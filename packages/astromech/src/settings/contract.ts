/**
 * Settings service method contracts — the declared shape + permission +
 * effect for each verb. `input` is the method's argument object, not the
 * HTTP body: `settings.set` is `set({ key, value })`, key on the wire path.
 */

import type { ServiceMethodContract } from '@/types/index';
import { z } from 'zod';
import { setSettingSchema } from './schema';

export const settingsContract = {
    all: {
        summary: 'List all settings (full shape, for an authenticated admin).',
        input: z.object({ full: z.boolean().optional() }),
        permission: 'settings:read',
        mutates: false,
    },
    get: {
        summary: 'Read one setting by key.',
        input: z.object({
            key: z.string(),
            locale: z.string().optional(),
            full: z.boolean().optional(),
        }),
        permission: 'settings:read',
        mutates: false,
    },
    set: {
        summary: 'Create or update a setting value.',
        input: setSettingSchema.extend({ key: z.string() }),
        permission: 'settings:update',
        mutates: true,
        idempotent: true,
    },
} satisfies Record<string, ServiceMethodContract>;
