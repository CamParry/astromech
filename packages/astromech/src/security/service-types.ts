/**
 * The security service contract: what `app.security` offers. `service.ts`
 * binds the definition that implements it.
 */

import type { AllowedAddress, BlockedAddress } from '@/types/domain';

/** The block list and allow list. */
export type SecurityService = {
    /** The blocks in force, newest first. */
    listBlocked(): Promise<BlockedAddress[]>;
    /** Block an address or CIDR range, replacing any block on the same one. */
    block(params: {
        data: {
            address: string;
            reason?: string | null | undefined;
            expiresAt?: Date | string | null | undefined;
        };
    }): Promise<BlockedAddress>;
    unblock(params: { id: string }): Promise<void>;
    listAllowed(): Promise<AllowedAddress[]>;
    /** Allow an address or CIDR range, which overrides every block that covers it. */
    allow(params: {
        data: { address: string; reason?: string | null | undefined };
    }): Promise<AllowedAddress>;
    removeAllowed(params: { id: string }): Promise<void>;
};
