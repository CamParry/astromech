/**
 * The console policy: a test fails on a `console.error` or `console.warn` it
 * did not declare with `expectConsole`, and on a declared one that never came.
 * `console-guard.ts` installs it for every test file.
 */
import { format } from 'node:util';

type Level = 'error' | 'warn';

type Expectation = { level: Level; pattern: RegExp | string; seen: boolean };

type GuardState = { expected: Expectation[]; unexpected: string[]; installed: boolean };

/**
 * What the current test declared and what it logged that nobody declared. Held
 * on `globalThis`, so every copy of this module a worker loads shares it.
 */
const state = ((
    globalThis as { __astromechConsoleGuard?: GuardState }
).__astromechConsoleGuard ??= { expected: [], unexpected: [], installed: false });

/**
 * Declare that the current test logs a `console[level]` message matching
 * `pattern` (a substring or a RegExp). Matching output is kept off the
 * terminal, and the test fails if no message matches.
 */
export function expectConsole(level: Level, pattern: RegExp | string): void {
    state.expected.push({ level, pattern, seen: false });
}

/**
 * Replace `console.error` and `console.warn` with versions that check each
 * message against the current test's declarations. Installed once per worker.
 */
export function installConsoleGuard(): void {
    if (state.installed) return;
    state.installed = true;
    for (const level of ['error', 'warn'] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]): void => {
            const message = format(...args);
            const match = state.expected.find(
                (expectation) =>
                    expectation.level === level && matches(message, expectation.pattern)
            );
            if (match !== undefined) {
                match.seen = true;
                return;
            }
            state.unexpected.push(`console.${level}: ${message}`);
            original(...args);
        };
    }
}

/**
 * The failures since the last call, as one message, or null when there are
 * none. Clears the declarations, so each test starts with none.
 */
export function takeConsoleFailures(): string | null {
    const missing = state.expected
        .filter((expectation) => !expectation.seen)
        .map(
            (expectation) =>
                `expected a console.${expectation.level} matching ${String(expectation.pattern)}, and none came`
        );
    const failures = [...state.unexpected, ...missing];
    state.expected = [];
    state.unexpected = [];
    if (failures.length === 0) return null;
    return `Unexpected console output. Declare expected output with expectConsole, or fix its cause.\n${failures.join('\n')}`;
}

function matches(message: string, pattern: RegExp | string): boolean {
    return typeof pattern === 'string'
        ? message.includes(pattern)
        : pattern.test(message);
}
