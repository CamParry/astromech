import { z } from '@hono/zod-openapi';
import { clearAddressListCache } from '@/security/address-lists';
import { blockedAddressRepository } from '@/security/repository/blocked-addresses';
import { defineServiceMethod } from '@/services/define-service-method';

/**
 * Applies at once in this process; another Workers isolate or server process
 * keeps its copy of the list for up to a minute.
 */
export const unblockAddress = defineServiceMethod({
    summary: 'Remove a block.',
    input: z.strictObject({ id: z.string() }),
    output: z.void(),
    access: 'security:manage',
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params): Promise<void> {
        const { id } = params;

        await blockedAddressRepository.delete({ id });
        clearAddressListCache();
    },
});
