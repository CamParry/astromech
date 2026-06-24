import { getCurrentUser } from '@/context/index.js';
import { getEntryStorage } from '../../storage/registry.js';
import {
    createPreviewTokenStorage,
    hashPreviewToken,
} from '../../storage/preview-tokens.js';
import { loadAndAssertType } from '../../internal/records.js';
import { assertCapability } from '../../internal/supports.js';
import { generatePreviewSecret } from '../../internal/preview.js';

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
    await createPreviewTokenStorage().issue(
        id,
        hash,
        params.expiresAt ?? null,
        user?.id ?? null
    );
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
