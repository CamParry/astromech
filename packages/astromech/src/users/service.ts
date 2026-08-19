/**
 * Users service — the user CRUD verbs.
 *
 * Thin assembler: wires the per-operation functions in `operations/**` into the
 * public `UsersService` object. All policy (validation, field processing,
 * relationship indexing) lives in `operations/**` + `internal/**`; persistence
 * flows through the storage seam. Consumers reach it as `app.users`.
 */

import type { UsersService } from '@/types/index';
import { create } from './operations/create';
import { deleteUser } from './operations/delete';
import { get } from './operations/get';
import { query } from './operations/query';
import { update } from './operations/update';

export const usersService: UsersService = {
    query,
    get,
    create,
    update,
    delete: deleteUser,
};
