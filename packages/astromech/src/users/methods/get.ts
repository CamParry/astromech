import type { UserResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { defineServiceMethod } from '@/services/define-service-method';
import { defaultContentLocale } from '@/utilities/locale';
import { userRepository } from '../repository';
import { userSchema } from '../schema';

/**
 * A missing user answers null. A locale with no content row falls back to the
 * default locale, then to any locale the user has; the result's `locale` names
 * the one read.
 */
export const getUser = defineServiceMethod({
    summary: 'Read one user by id.',
    input: z.strictObject({ id: z.string(), locale: z.string().optional() }),
    output: userSchema.nullable(),
    access: 'users:read',
    mutates: false,
    async handler(params, ctx): Promise<UserResource | null> {
        const { id } = params;
        const { config } = ctx;
        const locale = resolveResourceLocale('user', config, undefined, params.locale);
        const fallbackLocale = defaultContentLocale(config);

        return userRepository.findOne(id, { locale, fallbackLocale });
    },
});
