import type { AllowedAddress } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { ApiError } from '@/errors/api-error';
import { clearAddressListCache } from '@/security/address-lists';
import { allowedAddressRepository } from '@/security/repository/allowed-addresses';
import { addressRangeInput, allowedAddressSchema } from '@/security/schema';
import { defineServiceMethod } from '@/services/define-service-method';

/** An allowed address is never blocked, whatever blocks cover it. Answers 409 for an address already listed. */
export const allowAddress = defineServiceMethod({
    summary: 'Allow an IP address or CIDR range, overriding every block.',
    input: z.strictObject({
        data: z.strictObject({
            address: addressRangeInput,
            reason: z.string().nullable().optional(),
        }),
    }),
    output: allowedAddressSchema,
    access: 'security:manage',
    mutates: true,
    async handler(params, ctx): Promise<AllowedAddress> {
        const { data } = params;
        const { user } = ctx;
        const userId = user?.id ?? null;

        const allowed = await allowedAddressRepository.createIfAbsent({
            address: data.address,
            reason: data.reason ?? null,
            createdBy: userId,
        });
        if (allowed === null) {
            throw new ApiError('That address is already on the allow list.', {
                status: 409,
                code: 'CONFLICT',
            });
        }
        clearAddressListCache();
        return allowed;
    },
});
