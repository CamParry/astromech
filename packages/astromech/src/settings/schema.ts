import type { JsonValue } from '@/types/index';
import { z } from 'zod';

/**
 * A setting's value: unvalidated on the wire, since `settings` is the naked
 * key-value class and declares no fields, but typed as the `JsonValue` the
 * service interface promises.
 */
const settingValue = z.unknown() as unknown as z.ZodType<JsonValue>;

export const setSettingSchema = z.object({
    value: settingValue,
});
