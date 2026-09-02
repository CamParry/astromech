import { requireCanonical } from '../../internal/global';

/**
 * Discards the staged copy of one locale of a global. Throws when the global has
 * no row in that locale, or no staged change.
 */
export async function deleteStagedGlobal(params: {
    key: string;
    locale?: string;
}): Promise<void> {
    const { repository, id, locale } = await requireCanonical({
        ...params,
        capability: 'staging',
    });
    const staged = await repository.staging.getByCanonical(id, locale);
    if (!staged) throw new Error(`No staged change for global '${params.key}'`);
    await repository.staging.delete({ id, locale });
}
