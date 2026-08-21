import { parseInput } from '@/errors/index';
import { getCurrentUser } from '@/request-context/index';
import { generatePreviewSecret } from '../../internal/preview';
import { loadAndAssertType } from '../../internal/records';
import { assertCapability } from '../../internal/type-config';
import {
    createPreviewTokenRepository,
    hashPreviewToken,
} from '../../repository/preview-tokens';
import { getEntryRepository } from '../../repository/registry';
import { previewTokenSchema } from '../../schema';

/**
 * How long a preview token lives when the caller names no expiry: 7 days.
 * `decisions/0079` records why this default exists and why there is no config
 * key.
 */
export const DEFAULT_PREVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issues a preview token for a canonical entry: returns the plaintext once,
 * stores only its hash. Throws when the type can't stage or the id names a
 * staged change. Omitted `expiresAt` takes the default TTL, explicit null never expires.
 */
export async function issuePreviewToken(params: {
    type: string;
    id: string;
    expiresAt?: Date | null;
}): Promise<{ token: string }> {
    const { type, id } = params;
    assertCapability(type, 'staging');
    const repository = getEntryRepository(type);
    const canonical = await loadAndAssertType(repository, type, id);
    if (canonical.stagedFor != null) {
        throw new Error(
            `Entry '${id}' is a staged change; issue the preview token on its canonical entry.`
        );
    }
    const token = generatePreviewSecret();
    const hash = await hashPreviewToken(token);
    const user = await getCurrentUser();
    // Coerced, not trusted: a JSON transport (MCP, the AI tool-loop) sends an
    // ISO string, and this column is a date. `schedule` validates `publishedAt`
    // the same way for the same reason.
    const { expiresAt } = parseInput(previewTokenSchema, { expiresAt: params.expiresAt });
    // `null` is not the same as absent: an omitted `expiresAt` takes the default
    // TTL, an explicit `null` means "never expires". The repository's `isValid`
    // honours null (see `decisions/0079`).
    const expiry =
        expiresAt === undefined
            ? new Date(Date.now() + DEFAULT_PREVIEW_TOKEN_TTL_MS)
            : expiresAt;
    await createPreviewTokenRepository().issue(id, hash, expiry, user?.id ?? null);
    return { token };
}

/**
 * Revokes any preview token for the entry. Throws when the type can't stage or
 * no entry of that type matches the id.
 */
export async function revokePreviewToken(params: {
    type: string;
    id: string;
}): Promise<void> {
    const { type, id } = params;
    assertCapability(type, 'staging');
    const repository = getEntryRepository(type);
    await loadAndAssertType(repository, type, id);
    await createPreviewTokenRepository().revoke(id);
}
