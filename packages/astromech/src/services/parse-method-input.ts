/**
 * `parseMethodInput` — the one place a service method's `input` schema is
 * applied. Every call path runs it before the handler, so an in-process caller
 * is checked exactly as an HTTP one is.
 */

import type { ServiceMethodContract } from '@/types/index';
import { ValidationError } from '@/errors/validation';

/**
 * Parse `input` against `method.input`, throwing the framework's 422 on
 * failure, and return the value the handler is called with. No argument is the
 * empty argument object, so `ctx.notifications.count()` is a legal bare call.
 */
export function parseMethodInput(
    method: Pick<ServiceMethodContract, 'input'>,
    input: unknown
): unknown {
    const parsed = method.input.safeParse(input ?? {});
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return parsed.data;
}
