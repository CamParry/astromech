import type { Setting } from '@/types/index';
import { z } from 'zod';
import { defineServiceMethod } from '@/services/define-service-method';
import { toSetting } from '../internal/to-setting';
import { createSettingsRepository } from '../repository';
import { isPublicSettingKey } from '../visibility';

/**
 * Every setting. A plain read answers with the public-marked keys alone;
 * `full: true` is what a trusted or authenticated caller asks for.
 */
export const allSettings = defineServiceMethod({
    summary: 'List all settings (full shape, for an authenticated admin).',
    input: z.object({ full: z.boolean().optional() }),
    access: 'settings:read',
    mutates: false,
    async handler(params, ctx): Promise<Setting[]> {
        const rows = await createSettingsRepository().all();
        const full = params.full ?? false;
        const publicKeys = ctx.config.publicSettingKeys;
        return rows
            .filter((row) => full || isPublicSettingKey(row.key, publicKeys))
            .map(toSetting);
    },
});
