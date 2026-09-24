/**
 * Config-derived helpers shared across the globals operations: resolving a key
 * to its declaration, the capability a method requires, the repository handle,
 * and the row → `Global` narrowing.
 */

import type { GlobalRow, GlobalsRepository } from '../repository/globals-table';
import type { Global, ResolvedConfig, ResolvedGlobal } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { assertCapability } from '@/content/capabilities';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { ResourceNotFoundError } from '@/errors/resource';
import { createGlobalsRepository } from '../repository/globals-table';
import { resolveGlobal } from '../resolve-global';

/** Every capability a global may declare, for narrowing a bare string to one. */
export const GLOBAL_CAPABILITIES = [
    'statuses',
    'translatable',
    'versioning',
    'staging',
] as const;

/** The capabilities a global declares. A global is never trashed and has no slug. */
export type GlobalCapability = (typeof GLOBAL_CAPABILITIES)[number];

/** Whether a method's `requires`, typed as a bare string, names a global capability. */
export function isGlobalCapability(value: string): value is GlobalCapability {
    return (GLOBAL_CAPABILITIES as readonly string[]).includes(value);
}

/** {@link resolveGlobal}, throwing for a key nothing declares. */
export function getDeclaredGlobal(config: ResolvedConfig, key: string): ResolvedGlobal {
    const global = resolveGlobal(config, key);
    if (!global) throw new ResourceNotFoundError('global', { id: key });
    return global;
}

/**
 * Enforce the capability a method requires of the global a call's `input`
 * names. An undeclared key is left to the method, which answers it with a 404.
 */
export function assertRequiredCapability(
    config: ResolvedConfig,
    input: unknown,
    capability: string
): void {
    const key =
        typeof input === 'object' && input !== null
            ? (input as { key?: unknown }).key
            : undefined;
    const global = typeof key === 'string' ? resolveGlobal(config, key) : undefined;
    if (!global) return;
    if (!isGlobalCapability(capability)) {
        throw new Error(`'${capability}' is not a global capability.`);
    }
    assertCapability('global', global, capability);
}

/** The globals repository, bound to the configured default content locale. */
export function globalRepository(config: ResolvedConfig): GlobalsRepository {
    return createGlobalsRepository({ defaultLocale: defaultContentLocale(config) });
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
 * Resolve a call to the global, the locale and the canonical row it addresses.
 * Every operation but `update` needs a row that already exists: only a write
 * may create one.
 */
export async function getCanonicalGlobal(
    config: ResolvedConfig,
    params: { key: string; locale?: string | undefined }
): Promise<CanonicalGlobal> {
    const global = getDeclaredGlobal(config, params.key);
    const locale = resolveResourceLocale(
        RESOURCE_SPECS.global,
        config,
        global.id,
        params.locale
    );

    const repository = globalRepository(config);
    const id = await repository.idByKey(params.key);
    const current = id === null ? null : await repository.get({ id, locale });
    if (id === null || !current) {
        throw new ResourceNotFoundError('global', { id: params.key, locale });
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
