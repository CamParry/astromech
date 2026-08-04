import { z } from 'zod';
import { ValidationError } from '@/errors/validation.js';

/** Parse `data` with a zod `schema`, re-throwing zod failures as the framework's 422. */
export function parseWith<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}
