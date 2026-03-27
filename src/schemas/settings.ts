import { z } from 'zod';

export const setSettingSchema = z.object({
    value: z.unknown(),
});
