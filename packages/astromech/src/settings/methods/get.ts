import type { JsonValue } from '@/types/index';
import { z } from 'zod';
import { defineServiceMethod } from '@/services/define-service-method';
import { createSettingsRepository } from '../repository';
import { isPublicSettingKey } from '../visibility';

/** One setting's value, or null when the key is unset or private to this read. */
export const getSetting = defineServiceMethod({
    summary: 'Read one setting by key.',
    input: z.object({
        key: z.string(),
        full: z.boolean().optional(),
    }),
    access: 'settings:read',
    mutates: false,
    async handler(
        params: { key: string; full?: boolean },
        ctx
    ): Promise<JsonValue | null> {
        const { key } = params;
        const full = params.full ?? false;

        // On a public read, reject private keys immediately without a DB round-trip.
        if (!full && !isPublicSettingKey(key, ctx.config.publicSettingKeys)) {
            return null;
        }

        const rows = await createSettingsRepository().byKeys([key]);
        return rows[0]?.value ?? null;
    },
});
