import { z } from 'zod';
import { jsonValue } from '@/services/json';

export const setSettingSchema = z.object({
    value: jsonValue,
});
