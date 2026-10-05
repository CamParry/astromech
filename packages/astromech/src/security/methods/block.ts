import type { BlockedAddress } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { ApiError } from '@/errors/api-error';
import { clearAddressListCache } from '@/security/address-lists';
import { blockedAddressRepository } from '@/security/repository/blocked-addresses';
import {
    addressRangeInput,
    blockedAddressSchema,
    expiresAtInput,
} from '@/security/schema';
import { defineServiceMethod } from '@/services/define-service-method';
import { isAddressInRange, parseAddressRange } from '@/utilities/ip-address';

/**
 * Replaces any block on the same address. Refused when the range covers the
 * caller's own address, so an administrator cannot lock themselves out over
 * HTTP; the CLI and MCP have no address.
 */
export const blockAddress = defineServiceMethod({
    summary: 'Block an IP address or CIDR range.',
    input: z.strictObject({
        data: z.strictObject({
            address: addressRangeInput,
            reason: z.string().nullable().optional(),
            expiresAt: expiresAtInput,
        }),
    }),
    output: blockedAddressSchema,
    access: 'security:manage',
    mutates: true,
    async handler(params, ctx): Promise<BlockedAddress> {
        const { data } = params;
        const { user, clientAddress } = ctx;
        const userId = user?.id ?? null;

        assertNotOwnAddress(data.address, clientAddress);

        await blockedAddressRepository.upsert({
            address: data.address,
            reason: data.reason ?? null,
            source: 'manual',
            expiresAt: data.expiresAt ?? null,
            createdBy: userId,
        });
        clearAddressListCache();

        const block = await blockedAddressRepository.findByAddress(data.address);
        if (block === null) throw new Error('The block was not written.');
        return block;
    },
});

function assertNotOwnAddress(address: string, clientAddress: string | undefined): void {
    const range = parseAddressRange(address);
    if (range === undefined || clientAddress === undefined) return;
    if (!isAddressInRange(clientAddress, range)) return;
    throw new ApiError(
        'That range covers your own address, so blocking it would lock you out.',
        { status: 409, code: 'CONFLICT' }
    );
}
