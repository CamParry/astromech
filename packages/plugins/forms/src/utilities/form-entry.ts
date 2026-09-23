/** Reading a `form` entry: its stored values, and loading a submittable one. */

import type { Entry, PluginContext } from 'astromech';
import { FORM_TYPE } from '../types';

/** An entry's stored field values. */
export function entryFields(entry: Entry): Record<string, unknown> {
    return (entry.fields ?? {}) as Record<string, unknown>;
}

/**
 * Load a live, submittable form by slug, or `null`. The read asks for the full
 * shape, since the form's own settings may be private, which bypasses the
 * publish gate and makes the published and enabled checks this function's job.
 */
export async function loadForm(ctx: PluginContext, slug: unknown): Promise<Entry | null> {
    if (typeof slug !== 'string' || slug === '') return null;

    const { data } = await ctx.entries.query({
        type: `${ctx.plugin.namespace}/${FORM_TYPE}`,
        where: { slug },
        limit: 1,
        full: true,
    });

    const form = (data as Entry[])[0];
    if (!form) return null;
    if (form.status !== 'published') return null;
    // Absent means "on": the field's declared default is true.
    if (entryFields(form)['enabled'] === false) return null;
    return form;
}

/** True when this form opts into the site's configured spam provider. */
export function usesSpam(form: Entry): boolean {
    return entryFields(form)['spamProtection'] !== false;
}
