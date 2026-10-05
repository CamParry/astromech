/**
 * When an update moves a live entry's public path, record a 301 from the old
 * path, keeping the rules loop-free and one hop deep. The writes are separate
 * calls: a plugin context has no transaction.
 */

import type { Hook } from 'astromech';
import { defineHook, isPubliclyVisible, resolveEntryLocalePath } from 'astromech';
import { createRedirectsRepository } from '../repository';

export const slugChangeHook: Hook = defineHook(
    'entry:afterUpdate',
    async (event, ctx) => {
        const entryType = ctx.config.entryTypes[event.type];
        const template = entryType?.url;
        if (!entryType || !template) return;
        // `event.entry` is the row before the write. A staged change is not
        // public, and a row that was not live (unpublished, scheduled or
        // trashed) had no public path to leave.
        const statuses = entryType.capabilities.statuses;
        if (event.entry.staged || !isPubliclyVisible(event.entry, { statuses })) return;

        const from = resolveEntryLocalePath(template, event.entry, ctx.config);
        const to = resolveEntryLocalePath(
            template,
            {
                locale: event.entry.locale,
                slug: event.data.slug ?? event.entry.slug,
                fields: { ...event.entry.fields, ...(event.data.fields ?? {}) },
            },
            ctx.config
        );
        if (!from || !to || from === to) return;

        const redirects = createRedirectsRepository(ctx.db);

        // The new path is live again, so no enabled rule may redirect away from it.
        const ruleFromNewPath = await redirects.findByFrom(to);
        if (ruleFromNewPath?.enabled === true) {
            await redirects.delete(ruleFromNewPath.id);
        }

        // Rules that led to the old path now lead straight to the new one. None
        // of them starts at the new path (that rule went above), so none loops.
        for (const rule of await redirects.findByTo(from)) {
            if (rule.enabled) await redirects.update(rule.id, { to });
        }

        // An enabled rule already at the old path, recorded earlier or made by
        // hand, stays as it is. A disabled one is re-pointed and enabled, since
        // `from` holds one rule per path.
        const ruleFromOldPath = await redirects.findByFrom(from);
        if (ruleFromOldPath === null) {
            await redirects.create({ from, to, status: '301', enabled: true });
        } else if (!ruleFromOldPath.enabled) {
            await redirects.update(ruleFromOldPath.id, {
                to,
                status: '301',
                enabled: true,
            });
        }
    }
);
