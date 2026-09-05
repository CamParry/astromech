/**
 * Users service — the user CRUD verbs. A thin assembler: it wires `methods/**`
 * into the `UsersService` definition, and all policy lives there or in
 * `internal/**`. Consumers reach the bound form as `app.users`.
 */

import type { UsersService } from '@/types/index';
import { defineService } from '@/services/define-service';
import { createUser } from './methods/create';
import { deleteUser } from './methods/delete';
import { getUser } from './methods/get';
import { queryUsers } from './methods/query';
import { updateUser } from './methods/update';
import { listUserVersions } from './methods/versions/list';
import { restoreUserVersion } from './methods/versions/restore';

export const usersDefinition = defineService<UsersService>('users', {
    query: queryUsers,
    get: getUser,
    create: createUser,
    update: updateUser,
    delete: deleteUser,
    versions: listUserVersions,
    restoreVersion: restoreUserVersion,
});
