import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '@/content/internal/batch.js';

/** Resolve after a tick, recording how many calls were in flight at the peak. */
function trackingRunner(peak: { value: number }): (n: number) => Promise<number> {
    let inFlight = 0;
    return async (n: number) => {
        inFlight += 1;
        peak.value = Math.max(peak.value, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return n * 2;
    };
}

describe('mapWithConcurrency', () => {
    it('keeps input order regardless of completion order', async () => {
        const results = await mapWithConcurrency([5, 1, 3], 2, async (n) => {
            await new Promise((resolve) => setTimeout(resolve, n));
            return n;
        });

        expect(results).toEqual([5, 1, 3]);
    });

    it('never exceeds the width it was given', async () => {
        const peak = { value: 0 };
        const results = await mapWithConcurrency(
            [1, 2, 3, 4, 5, 6, 7],
            3,
            trackingRunner(peak)
        );

        expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
        expect(peak.value).toBe(3);
    });

    it('handles an empty list and a width larger than the list', async () => {
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);

        const peak = { value: 0 };
        await mapWithConcurrency([1, 2], 10, trackingRunner(peak));
        expect(peak.value).toBe(2);
    });

    it('rejects when any item rejects', async () => {
        await expect(
            mapWithConcurrency([1, 2, 3], 2, async (n) => {
                if (n === 2) throw new Error('boom');
                return n;
            })
        ).rejects.toThrow('boom');
    });
});
