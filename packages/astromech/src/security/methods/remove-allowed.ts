import { z } from '@hono/zod-openapi';
import { clearAddressListCache } from '@/security/address-lists';
import { allowedAddressRepository } from '@/security/repository/allowed-addresses';
import { defineServiceMethod } from '@/services/define-service-method';

export const removeAllowedAddress = defineServiceMethod({
    summary: 'Remove an address from the allow list.',
    input: z.strictObject({ id: z.string() }),
    output: z.void(),
    access: 'security:manage',
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params): Promise<void> {
        const { id } = params;

        await allowedAddressRepository.delete({ id });
        clearAddressListCache();
    },
});
