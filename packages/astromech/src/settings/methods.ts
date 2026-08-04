/**
 * Settings service method contracts — the declared shape + permission + effect
 * for each settings verb. The single source the HTTP transport enforces against
 * (via permissionsFor) and the method manifest reads.
 *
 * `input` is the METHOD's argument object, not the HTTP body: `settings.set` is
 * called `set({ key, value })` — the key is a path parameter on the wire, so the
 * body schema alone would describe half the call.
 */

import { z } from 'zod';
import type { ServiceMethodContract } from '@/types/index.js';
import { setSettingSchema } from './schema.js';

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
