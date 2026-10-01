/** What one global's methods demand, read off the globals service's own methods. */

import type { Permission, ResolvedGlobal } from '@/types/index';
import { availableMethodPermissions } from '@/content/method-permissions';
import { globalsDefinition } from './service';

/**
 * The permissions the methods one global offers demand, each named once. The
 * call asks for the private shape, since `get` demands `read` of a public
 * global only then.
 */
export function globalMethodPermissions(global: ResolvedGlobal): Permission[] {
    return availableMethodPermissions(
        global,
        Object.values(globalsDefinition.catalogue),
        {
            key: global.id,
            full: true,
        }
    );
}
