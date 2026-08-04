import { getCurrentUser } from '@/request-context/index.js';
import { getEntryStorage } from '../../storage/registry.js';
import {
    createPreviewTokenStorage,
    hashPreviewToken,
} from '../../storage/preview-tokens.js';
import { loadAndAssertType } from '../../internal/records.js';
import { assertCapability } from '../../internal/supports.js';
import { generatePreviewSecret } from '../../internal/preview.js';
import { previewTokenSchema } from '../../schema.js';
import { validate } from '../../internal/validation.js';

/**
 * How long a preview token lives when the caller names no expiry: 7 days.
 *
 * A preview token bypasses the publish gate on an entry, and until this existed
 * every one ever issued was still valid — `isValid` treats a null `expiresAt` as
 * "forever", and the operation passed null whenever the caller said nothing. It
 * matters more now the confirm gate hands preview links out as its
 * out-of-band review path.
 *
 * A constant plus the existing per-call `expiresAt` is the whole surface; there
 * is deliberately no config key. Seven days is long enough for a human to get to
 * a review and short enough that a link pasted into a chat log stops working.
 */
export const DEFAULT_PREVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function issuePreviewToken(params: {
    type: string;
    id: string;
    expiresAt?: Date | null;
}): Promise<{ token: string }> {
    const { type, id } = params;
    assertCapability(type, 'staging');
    const storage = getEntryStorage(type);
    const canonical = await loadAndAssertType(storage, type, id);
    if (canonical.stagedFor != null) {
        throw new Error(
            `Entry '${id}' is a staged change; issue the preview token on its canonical entry.`
        );
    }
    const token = generatePreviewSecret();
    const hash = await hashPreviewToken(token);
    const user = getCurrentUser();
    // Coerced, not trusted: a JSON transport (MCP, the AI tool-loop) sends an
    // ISO string, and this column is a date. `schedule` validates `publishAt`
    // the same way for the same reason.
    const { expiresAt } = validate(previewTokenSchema, { expiresAt: params.expiresAt });
    // Three cases, and `null` is not the same as absent: an omitted `expiresAt`
    // takes the default TTL, while an explicit `null` still means "never
    // expires". `previewTokenSchema` permits null (it shares `publishAtField`,
    // which is `.nullable().optional()`) and the storage's `isValid` honours it,
    // so the escape hatch stays — it just has to be asked for now, instead of
    // being what every caller silently got.
    const expiry =
        expiresAt === undefined
            ? new Date(Date.now() + DEFAULT_PREVIEW_TOKEN_TTL_MS)
            : expiresAt;
    await createPreviewTokenStorage().issue(id, hash, expiry, user?.id ?? null);
    return { token };
}

export async function revokePreviewToken(params: {
    type: string;
    id: string;
}): Promise<void> {
    const { type, id } = params;
    assertCapability(type, 'staging');
    const storage = getEntryStorage(type);
    await loadAndAssertType(storage, type, id);
    await createPreviewTokenStorage().revoke(id);
}
