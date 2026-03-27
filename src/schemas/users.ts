import { z } from '@hono/zod-openapi';

export const createUserSchema = z.object({
    email: z.string().email('Must be a valid email address').openapi({ example: 'user@example.com' }),
    name: z.string().min(1, 'Name is required').openapi({ example: 'Jane Doe' }),
    fields: z.record(z.string(), z.unknown()).optional(),
    roleSlug: z.string().optional().openapi({ example: 'editor' }),
}).openapi('CreateUser');

export const updateUserSchema = z.object({
    email: z.string().email('Must be a valid email address').optional(),
    name: z.string().min(1, 'Name cannot be empty').optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    roleSlug: z.string().optional(),
}).openapi('UpdateUser');
