import type { Setting } from '@/types/index';
import { z } from 'zod';
import { defineServiceMethod } from '@/services/define-service-method';
import { toSetting } from '../internal/to-setting';
import { createSettingsRepository } from '../repository';
import { setSettingSchema } from '../schema';

/**
 * Write one key. The value is stored as given: `settings` is the naked
 * `plugin:*` key-value class, so nothing here declares fields to validate
 * against — editor-owned content with a field schema is a global.
 */
export const setSetting = defineServiceMethod({
    summary: 'Create or update a setting value.',
    input: setSettingSchema.extend({ key: z.string() }),
    access: 'settings:update',
    mutates: true,
    idempotent: true,
    async handler(params): Promise<Setting> {
        return toSetting(await createSettingsRepository().set(params.key, params.value));
    },
});
