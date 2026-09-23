import type { User } from '@/types/index';
import { AstromechError } from '@/errors/astromech-error';

/**
 * The user a notifications method acts for. Every verb here is session-scoped,
 * so a context with nobody signed in has no subject and fails loudly rather
 * than reading or writing somebody else's rows.
 */
export function subjectId(user: User | null): string {
    if (user === null) {
        throw new AstromechError(
            'notifications are session-scoped: they act on the signed-in ' +
                "user's own rows, and this context has no user to name one. " +
                'Use `ctx.notify` to emit.'
        );
    }
    return user.id;
}
