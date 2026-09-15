/**
 * Setup for every admin test file, registered in the admin's `vitest.config.ts`.
 *
 * It does nothing in a node-environment file. In a happy-dom file it does three
 * things:
 *
 * - It turns on React's act environment (`IS_REACT_ACT_ENVIRONMENT`), which
 *   React checks before it warns about `act(...)`.
 * - It unmounts whatever Testing Library rendered after each test. Vitest's
 *   globals are off, so Testing Library cannot register that cleanup itself.
 * - It replaces `fetch` with a guard that records each request, rejects it, and
 *   fails the test that made it. Without the guard, happy-dom sends the request
 *   to its default `http://localhost:3000` and the test passes by accident.
 *
 * Vitest runs `afterEach` hooks in reverse order of registration, so the
 * cleanup is registered after the guard in order to run before it: a request
 * fired while a component unmounts is still caught and blamed on its own test.
 * A test file's own `afterEach` hooks run before both.
 *
 * The guard is assigned directly rather than through `vi.stubGlobal`, so a test
 * that stubs `fetch` itself gets the guard back from `vi.unstubAllGlobals()`.
 *
 * A request can fire after the test that caused it has ended, for example a
 * query that settles late. It is then reported against the next test in the
 * file, or against the file if no test follows. The URL in the failure is how
 * to find the component that really made it.
 *
 * Vitest imports this file again before each test file, even with
 * `isolate: false`, so the hooks below attach to every file. `afterAll` puts
 * both globals back, so neither reaches a node file that runs next in the same
 * worker.
 */
import { afterAll, afterEach } from 'vitest';

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined };

if (typeof window !== 'undefined') {
    // Imported here so node-environment files never load react-dom.
    const { cleanup } = await import('@testing-library/react');
    installDomGuards(cleanup);
}

function installDomGuards(cleanup: () => void): void {
    const previousActEnvironment = reactGlobals.IS_REACT_ACT_ENVIRONMENT;
    const realFetch = globalThis.fetch;
    const requests: string[] = [];

    reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = (input, init) => {
        const request = describeRequest(input, init);
        requests.push(request);
        return Promise.reject(new Error(`Unmocked request: ${request}`));
    };

    function failOnRequests(when: string): void {
        if (requests.length === 0) return;
        const made = requests.splice(0).map((request) => `  ${request}`);
        throw new Error(
            [
                `Unmocked request made ${when}:`,
                ...made,
                'Stub fetch or mock the client module the component calls.',
            ].join('\n')
        );
    }

    afterEach(() => {
        failOnRequests('during this test');
    });

    // Registered after the guard, so it runs before it (see above).
    afterEach(cleanup);

    afterAll(() => {
        globalThis.fetch = realFetch;
        reactGlobals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
        failOnRequests('after the last test in this file');
    });
}

function describeRequest(input: RequestInfo | URL, init?: RequestInit): string {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const url = input instanceof Request ? input.url : String(input);
    return `${method.toUpperCase()} ${url}`;
}
