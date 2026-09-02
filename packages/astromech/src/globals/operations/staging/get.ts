import type { Global } from '@/types/index';
import { asGlobal, requireCanonical } from '../../internal/global';

/**
 * Returns the staged copy of one locale of a global, or null when there is none.
 * Throws when the global has no row in that locale.
 */
export async function getStagedGlobal(params: {
    key: string;
    locale?: string;
}): Promise<Global | null> {
    const { repository, id, locale } = await requireCanonical({
        ...params,
        capability: 'staging',
    });
    const staged = await repository.staging.getByCanonical(id, locale);
    return staged ? asGlobal(staged) : null;
}
