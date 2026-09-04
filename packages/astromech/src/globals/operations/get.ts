import type { VisibilityShape } from '@/content/visibility';
import type { Global } from '@/types/index';
import { applyVisibility, markPublic } from '@/content/visibility';
import { flattenEntryFields } from '@/fields/flatten';
import { getCurrentUser } from '@/request-context/request-context';
import { GlobalValidationError } from '../errors';
import {
    asGlobal,
    assertCapability,
    globalRepository,
    resolveGlobal,
    resolveLocale,
} from '../internal/global';

/**
 * Gets one locale of one global, filtered to the caller's visibility shape.
 * Returns null when that locale has never been saved or visibility hides it —
 * there is no fallback to another locale. An undeclared key throws, since a
 * declared-but-unsaved global is already null and a typo is a caller error.
 */
export async function getGlobal(params: {
    key: string;
    locale?: string;
    full?: boolean;
    staged?: boolean;
}): Promise<Global | null> {
    const global = resolveGlobal(params.key);
    const locale = resolveLocale(global, params.locale);

    // A staged change is never published, so a public read of one would answer
    // null for every global; asking for it in the public shape is a mistake
    // worth naming rather than an empty result.
    if (params.staged === true && params.full !== true) {
        throw new GlobalValidationError([
            'globals.get: `staged` requires `full`; a staged change is never ' +
                'part of the public read.',
        ]);
    }

    const repository = globalRepository();
    const id = await repository.idByKey(params.key);
    if (id === null) return null;

    if (params.staged === true) assertCapability(global, 'staging');
    const row =
        params.staged === true
            ? await repository.staging.getByCanonical(id, locale)
            : await repository.get({ id, locale });
    if (!row) return null;

    const record = asGlobal(row);
    const shape: VisibilityShape = params.full ? 'full' : 'public';
    const user = await getCurrentUser();

    const filtered = applyVisibility(
        {
            fields: record.fields,
            // A global with `statuses: false` has no draft state — every row is
            // live — so the publish gate does not apply to it. Its column still
            // reads `unpublished`, which would otherwise hide it from every
            // public read.
            ...(global.capabilities.statuses
                ? { status: record.status, publishedAt: record.publishedAt }
                : {}),
        },
        {
            shape,
            fields: flattenEntryFields(global.fields),
            audience: { role: user?.role ?? null, now: new Date() },
        }
    );
    if (filtered === null) return null;

    const result: Global = { ...record, fields: filtered.fields };
    return shape === 'public' ? markPublic(result) : result;
}
