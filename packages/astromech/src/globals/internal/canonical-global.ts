/** The global, locale and canonical row a globals call addresses. */

import type { GlobalRepository, GlobalResource } from '../repository';
import type { ResolvedConfig, ResolvedGlobal } from '@/types/index';
import { resolveResourceLocale } from '@/content/locale';
import { ResourceNotFoundError } from '@/errors/resource';
import { globalRepository } from '../repository';
import { getDeclaredGlobal } from '../resolve-global';

/** What an operation on an already-saved locale of a global works from. */
export type CanonicalGlobal = {
    global: ResolvedGlobal;
    locale: string;
    repository: GlobalRepository;
    /** The `globals.id`. The row exists, so this is never null. */
    id: string;
    current: GlobalResource;
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
    const locale = resolveResourceLocale('global', config, global.id, params.locale);

    const current = await globalRepository.findByKey(params.key, locale);
    if (!current) throw new ResourceNotFoundError('global', { id: params.key, locale });
    return { global, locale, repository: globalRepository, id: current.id, current };
}
