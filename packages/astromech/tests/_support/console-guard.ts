/**
 * Vitest `setupFiles` entry for core, the plugins and the admin: fails a test
 * on console output it did not declare (`console.ts` has the policy), and a
 * file on output from a `beforeAll` or `afterAll`.
 */
import { afterAll, afterEach } from 'vitest';
import { installConsoleGuard, takeConsoleFailures } from './console';

installConsoleGuard();

afterEach(() => {
    const failure = takeConsoleFailures();
    if (failure !== null) throw new Error(failure);
});

afterAll(() => {
    const failure = takeConsoleFailures();
    if (failure !== null) throw new Error(failure);
});
