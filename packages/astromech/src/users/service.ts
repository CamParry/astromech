/**
 * Users service — the user CRUD verbs. Thin assembler: wires the
 * per-operation functions into `UsersService`. All policy lives in
 * `operations/**` + `internal/**`; consumers reach it as `app.users`.
 */

import type { UsersService } from '@/types/index';
import { createUser } from './operations/create';
import { deleteUser } from './operations/delete';
import { getUser } from './operations/get';
import { queryUsers } from './operations/query';
import { updateUser } from './operations/update';
import { listUserVersions } from './operations/versions/list';
import { restoreUserVersion } from './operations/versions/restore';

export const usersService: UsersService = {
    query: queryUsers,
    get: getUser,
    create: createUser,
    update: updateUser,
    delete: deleteUser,
    versions: listUserVersions,
    restoreVersion: restoreUserVersion,
};
