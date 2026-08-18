/**
 * A step timer for a sequence of named steps. Wrap each step in `step()`, then
 * read `summary()` for a `total (a Xms, b Yms, …)` line. Generic — it holds no
 * knowledge of what the steps are.
 */

export type Stopwatch = {
    step<T>(label: string, run: () => Promise<T> | T): Promise<T>;
    summary(): string;
};

export function stopwatch(): Stopwatch {
    const start = Date.now();
    const marks: string[] = [];
    return {
        async step(label, run) {
            const from = Date.now();
            const result = await run();
            marks.push(`${label} ${Date.now() - from}ms`);
            return result;
        },
        summary() {
            return `${Date.now() - start}ms (${marks.join(', ')})`;
        },
    };
}
