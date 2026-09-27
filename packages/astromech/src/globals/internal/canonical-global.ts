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
    const { key } = params;
    const global = getDeclaredGlobal(config, key);
    const locale = resolveResourceLocale('global', config, global.id, params.locale);

    const current = await globalRepository.findByKey(key, locale);
    if (!current) throw new ResourceNotFoundError('global', { id: key, locale });

    return { global, locale, id: current.id, current };
}
