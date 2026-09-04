import type { User } from '@/types/index';
import { resolveUserLocale, userRepository } from '../internal/locale';
import { toUser } from '../internal/to-user';

/**
 * Read one user by id, or null when there is no such row. A locale with no
 * content row falls back to the default one, and the returned `locale` names
 * where the content came from.
 */
export async function getUser(params: {
    id: string;
    locale?: string;
}): Promise<User | null> {
    const locale = resolveUserLocale(params.locale);
    const row = await userRepository().get(params.id, locale);
    return row ? toUser(row) : null;
}
