import type { UserResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { resolveResourceLocale } from '@/content/locale';
import { patchedFieldNames, prepareFields } from '@/content/prepare-fields';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { assertKeepsAnAdmin } from '../internal/last-admin';
import { syncUserRelationships } from '../relationships';
import { userRepository } from '../repository';
import { updateUserSchema, userSchema } from '../schema';

/**
 * `name`, `email` and `role` are written whatever the locale. `fields` merges into
 * one locale's content row, and a locale with none is seeded from the default
 * locale's. Demoting the last admin is refused.
 */
export const updateUser = defineServiceMethod({
    summary:
        'Update a user’s profile or role. Fields merge: omitted fields keep ' +
        'their current value, and arrays are replaced whole.',
    input: z.strictObject({
        id: z.string(),
        locale: z.string().optional(),
        data: updateUserSchema,
    }),
    output: userSchema,
    access: 'users:update',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<UserResource> {
        const { id, data } = params;
        const { name, email, role, fields: patch } = data;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const locale = resolveResourceLocale('user', config, undefined, params.locale);
        const fallbackLocale = defaultContentLocale(config);

        // With no content row in `locale`, `base` is the row the new one is seeded from.
        const current = await userRepository.findOne(id, { locale });
        const base = current ?? (await userRepository.findOne(id, { fallbackLocale }));
        if (!base) throw new ResourceNotFoundError('user', { id });
        if (role !== undefined) await assertKeepsAnAdmin(base, role);

        const fields =
            patch === undefined
                ? undefined
                : await prepareFields({
                      resource: 'user',
                      config,
                      operation: 'update',
                      existing: base,
                      user,
                      scan: () => userRepository.findByLocale(locale),
                      excludeId: id,
                      base: base.fields,
                      patch,
                  });
        const patchedNames = patch === undefined ? [] : patchedFieldNames(patch);

        await transaction(async () => {
            if (current && changesVersionedContent('user', current, { fields })) {
                await snapshotVersion('user', userRepository.versions, current, user);
            }
            if (name !== undefined || email !== undefined || role !== undefined) {
                await userRepository.updateUserRow(id, { name, email, role });
            }
            if (fields !== undefined) {
                await userRepository.update(
                    { id, locale },
                    {
                        fields,
                        updatedBy: userId,
                        ...(current ? {} : { createdBy: userId }),
                    }
                );
                await propagateSharedFields('user', config, {
                    translatable: userRepository.translatable,
                    record: { id, locale },
                    fields,
                    patchedFieldNames: patchedNames,
                });
                await syncUserRelationships(config, id);
            }
        });

        const updated = await userRepository.findOne(id, { locale, fallbackLocale });
        if (!updated) throw new ResourceNotFoundError('user', { id });
        return updated;
    },
});
