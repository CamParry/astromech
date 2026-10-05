import type { AllowedAddress } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { allowedAddressRepository } from '@/security/repository/allowed-addresses';
import { allowedAddressSchema } from '@/security/schema';
import { defineServiceMethod } from '@/services/define-service-method';

/** Lists every allowed address and range, newest first. */
export const listAllowedAddresses = defineServiceMethod({
    summary: 'List the allowed addresses, newest first.',
    input: z.strictObject({}),
    output: z.array(allowedAddressSchema),
    access: 'security:manage',
    mutates: false,
    async handler(): Promise<AllowedAddress[]> {
        return allowedAddressRepository.findMany();
    },
});
