/**
 * Config-derived helpers shared across the globals operations: resolving a key
 * to its declaration, the locale a call writes, the capability assertions, the
 * repository handle, and the row → `Global` narrowing.
 */

import type { GlobalRow, GlobalsRepository } from '../repository/globals-table';
import type { Global, ResolvedGlobal } from '@/types/index';
import { getDefaultContentLocale } from '@/config/content-locale';
import { getConfig } from '@/config/registry';
import { QUALIFIED_SEPARATOR } from '@/entries/entry-types.shared';
import { CapabilityError } from '@/entries/errors';
import { GlobalNotFoundError, GlobalValidationError } from '../errors';
import { createGlobalsRepository } from '../repository/globals-table';

/** The capabilities a global declares. A global is never trashed and has no slug. */
export type GlobalCapability = 'statuses' | 'translatable' | 'versioning' | 'staging';

/**
 * The declaration for a key, or undefined when nothing declares it. A bare key
 * is a host global; a key holding the qualified separator is `<namespace>/<key>`
 * and resolves against that plugin's map alone, which is what stops a host
 * `settings` and a plugin's `seo/settings` reaching one another.
 */
export function findGlobal(key: string): ResolvedGlobal | undefined {
    const config = getConfig();
    const index = key.indexOf(QUALIFIED_SEPARATOR);
    if (index === -1) return config.globals[key];
    return config.pluginGlobals[key.slice(0, index)]?.[key.slice(index + 1)];
}

/** {@link findGlobal}, throwing for a key nothing declares. */
export function resolveGlobal(key: string): ResolvedGlobal {
    const global = findGlobal(key);
    if (!global) throw new GlobalNotFoundError({ key });
    return global;
}

/** Enforce a global's configured capability set. */
export function assertCapability(
    global: ResolvedGlobal,
    capability: GlobalCapability
): void {
    if (!global.capabilities[capability]) {
        throw new CapabilityError(global.id, capability, 'Global');
    }
}

/**
 * The locale a call addresses. A non-translatable global lives in the default
 * content locale alone, so any other locale is a caller error rather than a
 * silent write to the wrong row.
 */
export function resolveLocale(global: ResolvedGlobal, locale?: string): string {
    const defaultLocale = getDefaultContentLocale();
    const resolved = locale ?? defaultLocale;
    if (resolved !== defaultLocale && !global.capabilities.translatable) {
        throw new GlobalValidationError([
            `Global '${global.id}' is not translatable, so only the ` +
                `'${defaultLocale}' locale can be written.`,
        ]);
    }
    return resolved;
}

/** The globals repository, bound to the configured default content locale. */
export function globalRepository(): GlobalsRepository {
    return createGlobalsRepository({ defaultLocale: getDefaultContentLocale() });
}

/** What an operation on an already-saved locale of a global works from. */
export type CanonicalGlobal = {
    global: ResolvedGlobal;
    locale: string;
    repository: GlobalsRepository;
    /** The `globals.id` — the row exists, so this is never null. */
    id: string;
    current: GlobalRow;
};

/**
 * Resolve a call to the global, the locale and the canonical row it addresses,
 * asserting `capability` first. Every operation but `update` needs a row that
 * already exists: only a write may create one.
 */
export async function requireCanonical(params: {
    key: string;
    locale?: string | undefined;
    capability?: GlobalCapability;
}): Promise<CanonicalGlobal> {
    const global = resolveGlobal(params.key);
    if (params.capability) assertCapability(global, params.capability);
    const locale = resolveLocale(global, params.locale);

    const repository = globalRepository();
    const id = await repository.idByKey(params.key);
    const current = id === null ? null : await repository.get({ id, locale });
    if (id === null || !current) {
        throw new GlobalNotFoundError({ key: params.key, locale });
    }
    return { global, locale, repository, id, current };
}

/**
 * Narrow a repository row to the public `Global`. The row already carries every
 * member; `contentId` is dropped, as it never leaves the service. The shared
 * `ContentRow` types `status` and `publishedAt` as optional (a resource may have
 * no such column); `global_content` always has both, so the cast is the one
 * place that fact is stated.
 */
export function asGlobal(row: GlobalRow): Global {
    const { contentId: _contentId, ...global } = row;
    return global as Global;
}
