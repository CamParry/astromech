import { parseInput } from '@/errors/validation';
import { assertCapability } from '../../internal/entry-type';
import { generatePreviewSecret, hashPreviewToken } from '../../internal/preview';
import { getEntryResource } from '../../internal/records';
import { getEntryRepository } from '../../repository/registry';
import { previewTokenSchema } from '../../schema';

/**
 * How long a preview token lives when the caller names no expiry: 7 days.
 * There is no config key for it, because no caller has asked for one.
 */
export const DEFAULT_PREVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issues the entry's preview token, authorizing every locale of it: returns the
 * plaintext once, stores only its hash. Throws when the type can't stage or the
 * read is a staged one. Omitted `expiresAt` takes the default TTL, explicit
 * null never expires.
 */
export async function issuePreviewToken(params: {
    type: string;
    id: string;
    expiresAt?: Date | null;
}): Promise<{ token: string }> {
    const { type, id } = params;
    assertCapability(type, 'staging');
    const repository = getEntryRepository(type);
    const canonical = await getEntryResource(repository, type, id);
    if (canonical.staged) {
        throw new Error(
            `Entry '${id}' read as a staged change; issue the preview token on its canonical row.`
        );
    }
    const token = generatePreviewSecret();
    const hash = await hashPreviewToken(token);
    // Coerced, not trusted: a JSON transport (MCP, the AI tool-loop) sends an
    // ISO string, and this column is a date. `schedule` validates `publishedAt`
    // the same way for the same reason.
    const { expiresAt } = parseInput(previewTokenSchema, { expiresAt: params.expiresAt });
    // `null` is not the same as absent: an omitted `expiresAt` takes the default
    // TTL, an explicit `null` means "never expires". The repository's `isValid`
    // honours null.
    const expiry =
        expiresAt === undefined
            ? new Date(Date.now() + DEFAULT_PREVIEW_TOKEN_TTL_MS)
            : expiresAt;
    await repository.previewToken?.set(id, hash, expiry);
    return { token };
}

/**
 * Revokes the entry's preview token. Throws when the type can't stage or no
 * entry of that type matches the id.
 */
export async function revokePreviewToken(params: {
    type: string;
    id: string;
}): Promise<void> {
    const { type, id } = params;
    assertCapability(type, 'staging');
    const repository = getEntryRepository(type);
    await getEntryResource(repository, type, id);
    await repository.previewToken?.clear(id);
}
