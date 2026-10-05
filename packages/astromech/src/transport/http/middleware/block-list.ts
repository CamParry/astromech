/**
 * Block-list middleware: refuses a request from a blocked client address before
 * any route, public or not, runs.
 */

import type { ServerBindings } from '@/transport/http/client-address';
import { createMiddleware } from 'hono/factory';
import { isAddressBlocked } from '@/security/address-lists';
import { getClientAddress } from '@/transport/http/client-address';
import { forbidden } from './errors';

/** Refuse a request from a blocked client address with 403 `ADDRESS_BLOCKED`. A request with no known address passes. */
export const refuseBlockedAddresses = createMiddleware<{
    Bindings: ServerBindings;
}>(async (c, next) => {
    const address = getClientAddress(c);
    if (address !== undefined && (await isAddressBlocked(address))) {
        return forbidden(c, 'Requests from this address are blocked.', 'ADDRESS_BLOCKED');
    }
    return next();
});
