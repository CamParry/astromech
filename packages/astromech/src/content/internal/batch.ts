/**
 * Fixed-width concurrency for the per-field provider calls, so a twenty-field
 * entry does not open twenty connections. No dependency: `limit` workers pull
 * from a shared cursor and results keep input order.
 */

export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    run: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array<R>(items.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            const item = items[index];
            if (item === undefined) continue;
            results[index] = await run(item, index);
        }
    };

    const width = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: width }, () => worker()));
    return results;
}
