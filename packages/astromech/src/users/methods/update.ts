import type { User } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { patchedFieldNames, writeFields } from '@/content/write-fields';
import { transaction } from '@/database/transaction';
import { ResourceNotFoundError } from '@/errors/resource';
import { getRole } from '@/permissions/roles';
import { defineServiceMethod } from '@/services/define-service-method';
import { assertKeepsAnAdmin } from '../internal/last-admin';
import { syncUserRelationships } from '../internal/relationships';
import { toUser } from '../internal/to-user';
import { userRepository } from '../repository';
import { updateUserSchema } from '../schema';

/**
 * Update a user's profile, role and custom fields. `name`, `email` and `role`
 * are the account row and are written whatever the locale; `fields` addresses
 * one locale's content row, and a locale with none gets one seeded from the
 * default-locale row with the patch applied over it. Demoting the last admin is refused.
 */
export const updateUser = defineServiceMethod({
    summary:
        'Update a user’s profile or role. Fields merge: omitted fields keep ' +
        'their current value, and arrays are replaced whole.',
    input: z.object({
        id: z.string(),
        locale: z.string().optional(),
        data: updateUserSchema,
    }),
    access: 'users:update',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<User> {
        const { id, data } = params;
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.user,
            ctx.config,
            undefined,
            params.locale
        );
        const fallbackLocale = defaultContentLocale(ctx.config);

        // The row this write edits, or — when the locale has none — the
        // default-locale row the new one is copied from.
        const current = await userRepository.findOne(id, { locale });
        const base = current ?? (await userRepository.findOne(id, { fallbackLocale }));
        if (!base) throw new ResourceNotFoundError('user', { id });

        const config = ctx.config;
        if (data.role !== undefined) {
            getRole(config, data.role);
            await assertKeepsAnAdmin(
                userRepository,
                base,
                data.role,
                'Cannot remove the last administrator'
            );
        }

        const patch = data.fields;
        const patchedNames = patch === undefined ? [] : patchedFieldNames(patch);

        // A patch is merged over `base`, so a locale being written for the first
        // time is seeded from the default-locale row. A write naming no `fields`
        // at all touches the account row alone and creates no content row.
        const fields =
            patch === undefined
                ? undefined
                : await writeFields(
                      RESOURCE_SPECS.user,
                      config,
                      { base: base.fields, patch },
                      {
                          operation: 'update',
                          record: toUser(base),
                          user: ctx.user,
                          scan: () => userRepository.findByLocale(locale),
                          excludeId: id,
                      }
                  );

        const { name, email, role } = data;
        const userId = ctx.user?.id ?? null;

        // The version, the account write, the content write and the index write
        // are one transaction: an index that outlived a failed write would name
        // relations the stored fields do not.
        await transaction(async () => {
            if (
                current &&
                changesVersionedContent(RESOURCE_SPECS.user, current, { fields })
            ) {
                await snapshotVersion(
                    RESOURCE_SPECS.user,
                    userRepository.versions,
                    current,
                    ctx.user
                );
            }
            if (name !== undefined || email !== undefined || role !== undefined) {
                await userRepository.updateAccount(id, { name, email, role });
            }
            if (fields !== undefined) {
                await userRepository.update(
                    { id, locale },
                    {
                        fields,
                        updatedBy: userId,
                        // A locale being written for the first time is authored
                        // now, whoever created the account.
                        ...(current ? {} : { createdBy: userId }),
                    }
                );
            }
            // An update that never touched `fields` must leave the index and the
            // user's other locales alone.
            if (fields !== undefined && patch !== undefined) {
                await propagateSharedFields(RESOURCE_SPECS.user, config, {
                    translatable: userRepository.translatable,
                    record: { id, locale },
                    fields,
                    patchedFieldNames: patchedNames,
                });
                await syncUserRelationships(ctx.config, id);
            }
        });

        const updated = await userRepository.findOne(id, { locale, fallbackLocale });
        if (!updated) throw new ResourceNotFoundError('user', { id });
        return toUser(updated);
    },
});
