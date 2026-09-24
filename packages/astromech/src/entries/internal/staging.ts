/** What every staging operation on one locale of an entry starts from. */

import type { EntryRepository } from '../repository/types';
import type { EntryWithContentId } from './read-entry';
import type { ResolvedConfig } from '@/types/index';
import { CapabilityError } from '@/errors/capability';
import { getEntryRepository } from '../repository/registry';
import { getEntryOfType } from './read-entry';

/** An entry's repository with its staging group, and the canonical row addressed. */
export type StagingTarget = {
    repository: EntryRepository;
    staging: NonNullable<EntryRepository['staging']>;
    canonical: EntryWithContentId;
};

/**
 * Resolve a staging call to its repository and canonical row. A repository with
 * no staging group refuses with `CapabilityError`, and a missing entry or locale
 * with a 404.
 */
export async function resolveStagingTarget(
    config: ResolvedConfig,
    params: { type: string; id: string; locale?: string | undefined }
): Promise<StagingTarget> {
    const repository = getEntryRepository(params.type);
    const { staging } = repository;
    if (!staging) throw new CapabilityError('entry', params.type, 'staging');
    const canonical = await getEntryOfType(
        config,
        repository,
        params.type,
        params.id,
        params.locale
    );
    return { repository, staging, canonical };
}
