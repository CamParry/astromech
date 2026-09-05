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
                "user's own rows, and there is no request context here to name one. " +
                'Use `ctx.notify` to emit, or call this inside `runWithRequest`.'
        );
    }
    return user.id;
}
