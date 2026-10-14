import type { BlockedAddress } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { securityPermission } from '@/security/permissions';
import { blockedAddressRepository } from '@/security/repository/blocked-addresses';
import { blockedAddressSchema } from '@/security/schema';
import { defineServiceMethod } from '@/services/define-service-method';

/** Only the blocks in force: an expired one is gone from the list before the job deletes it. */
export const listBlockedAddresses = defineServiceMethod({
    summary: 'List the blocked addresses, newest first.',
    input: z.strictObject({}),
    output: z.array(blockedAddressSchema),
    access: securityPermission('manage'),
    mutates: false,
    async handler(): Promise<BlockedAddress[]> {
        return blockedAddressRepository.findActive(new Date());
    },
});
