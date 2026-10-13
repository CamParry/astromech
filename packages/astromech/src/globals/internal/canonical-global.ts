import type { GlobalResource } from '../repository';
import type { ResolvedConfig, ResolvedGlobal } from '@/types/index';
import { resolveResourceLocale } from '@/content/locale';
import { ResourceNotFoundError } from '@/errors/resource';
import { globalRepository } from '../repository';
import { getDeclaredGlobal } from '../resolve-global';

/** What a method on an already-saved locale of a global works from. */
export type CanonicalGlobal = {
    global: ResolvedGlobal;
    locale: string;
    /** The `globals.id`. The row exists, so this is never null. */
    id: string;
    current: GlobalResource;
};

/**
 * The global, the resolved locale and the canonical row a call addresses. A
 * locale with no row throws: only `update` may create one.
 */
export async function getCanonicalGlobal(
    config: ResolvedConfig,
    params: { key: string; locale?: string | undefined }
): Promise<CanonicalGlobal> {
    const { global, locale, current } = await readCanonical(config, params);
    if (!current) throw new ResourceNotFoundError('global', { id: params.key, locale });

    return { global, locale, id: current.id, current };
}

/**
 * As `getCanonicalGlobal`, but null for a locale with no row: a declared global
 * exists before anything saves it. An undeclared key still throws.
 */
export async function findCanonicalGlobal(
    config: ResolvedConfig,
    params: { key: string; locale?: string | undefined }
): Promise<CanonicalGlobal | null> {
    const { global, locale, current } = await readCanonical(config, params);
    return current ? { global, locale, id: current.id, current } : null;
}

/** The declared global, the resolved locale, and that locale's row or null. */
async function readCanonical(
    config: ResolvedConfig,
    params: { key: string; locale?: string | undefined }
): Promise<{ global: ResolvedGlobal; locale: string; current: GlobalResource | null }> {
    const global = getDeclaredGlobal(config, params.key);
    const locale = resolveResourceLocale('global', config, global.id, params.locale);
    const current = await globalRepository.findByKey(params.key, locale);
    return { global, locale, current };
}
