import type { User } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { defineServiceMethod } from '@/services/define-service-method';
import { toUser } from '../internal/to-user';
import { userRepository } from '../repository';

/**
 * Read one user by id, or null when there is no such row. A locale with no
 * content row falls back to the default one, and the returned `locale` names
 * where the content came from.
 */
export const getUser = defineServiceMethod({
    summary: 'Read one user by id.',
    input: z.object({ id: z.string(), locale: z.string().optional() }),
    access: 'users:read',
    mutates: false,
    async handler(params, ctx): Promise<User | null> {
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.user,
            ctx.config,
            undefined,
            params.locale
        );
        const row = await userRepository.findOne(params.id, {
            locale,
            fallbackLocale: defaultContentLocale(ctx.config),
        });
        return row ? toUser(row) : null;
    },
});
