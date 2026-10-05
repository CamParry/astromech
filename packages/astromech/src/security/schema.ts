/** The security service's input and output schemas. */

import { z } from '@hono/zod-openapi';
import { ADDRESS_BLOCK_SOURCES } from '@/security/tables';
import { withFallback } from '@/services/fallback';
import { parseAddressRange } from '@/utilities/ip-address';

/** An IP address or a CIDR range, as a block or an allow takes it. */
export const addressRangeInput = z
    .string()
    .trim()
    .refine((value) => parseAddressRange(value) !== undefined, {
        message: 'Must be an IP address or CIDR range',
    });

/** A `Date`, or an offset ISO string read as one; null for no expiry. */
export const expiresAtInput = z
    .union([
        z.date(),
        z
            .string()
            .datetime({ offset: true })
            .transform((value) => new Date(value)),
    ])
    .nullable()
    .optional();

/** A blocked address or range: the public `BlockedAddress`. */
export const blockedAddressSchema = z
    .object({
        id: z.string(),
        address: z.string(),
        reason: withFallback(z.string().nullable(), null),
        source: z.enum(ADDRESS_BLOCK_SOURCES),
        /** Null for a block that lasts until it is removed. */
        expiresAt: withFallback(z.date().nullable(), null),
        createdAt: z.date(),
        /** The user who added it; null for an automatic block or a deleted user. */
        createdBy: withFallback(z.string().nullable(), null),
    })
    .openapi('BlockedAddress');

/** An allowed address or range: the public `AllowedAddress`. */
export const allowedAddressSchema = z
    .object({
        id: z.string(),
        address: z.string(),
        reason: withFallback(z.string().nullable(), null),
        createdAt: z.date(),
        createdBy: withFallback(z.string().nullable(), null),
    })
    .openapi('AllowedAddress');
