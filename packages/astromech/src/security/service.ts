/**
 * Security service: the block list and allow list. A thin assembler that wires
 * `methods/**` into the `SecurityService` definition.
 */

import type { SecurityService } from '@/types/index';
import { defineService } from '@/services/define-service';
import { allowAddress } from './methods/allow';
import { blockAddress } from './methods/block';
import { listAllowedAddresses } from './methods/list-allowed';
import { listBlockedAddresses } from './methods/list-blocked';
import { removeAllowedAddress } from './methods/remove-allowed';
import { unblockAddress } from './methods/unblock';

export const securityDefinition = defineService<SecurityService>('security', {
    listBlocked: listBlockedAddresses,
    block: blockAddress,
    unblock: unblockAddress,
    listAllowed: listAllowedAddresses,
    allow: allowAddress,
    removeAllowed: removeAllowedAddress,
});
