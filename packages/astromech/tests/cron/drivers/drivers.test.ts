import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interval } from '@/cron/drivers/interval';
import { webhook } from '@/cron/drivers/webhook';
import { cloudflareCron } from '@/cron/drivers/cloudflare';

describe('interval', () => {
    beforeEach(() => {
        globalThis.__astromechCronInterval = undefined;
        vi.useFakeTimers();
    });

    afterEach(() => {
        interval().stop?.();
        globalThis.__astromechCronInterval = undefined;
        vi.useRealTimers();
    });

    it('has name "interval"', () => {
        expect(interval().name).toBe('interval');
    });

    it('invokes onTick with a Date after 60 seconds', async () => {
        const ticks: Date[] = [];
        const onTick = vi.fn(async (now: Date) => {
            ticks.push(now);
        });

        interval().start(onTick);
        expect(onTick).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(60_000);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(ticks[0]).toBeInstanceOf(Date);
    });

    // Two separate instances, because the handle lives on globalThis rather than
    // in the closure — a second driver must see the first one's interval.
    it('calling start() twice does not stack intervals', async () => {
        const onTick = vi.fn(async (_now: Date) => undefined);

        interval().start(onTick);
        interval().start(onTick);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(onTick).toHaveBeenCalledTimes(1);
    });

    it('stop() clears the interval', async () => {
        const onTick = vi.fn(async (_now: Date) => undefined);
        const driver = interval();

        driver.start(onTick);
        driver.stop?.();

        await vi.advanceTimersByTimeAsync(120_000);
        expect(onTick).not.toHaveBeenCalled();
        expect(globalThis.__astromechCronInterval).toBeUndefined();
    });
});

describe('webhook', () => {
    it('has name "webhook"', () => {
        expect(webhook().name).toBe('webhook');
    });

    it('start() is a no-op (does not throw)', () => {
        expect(() => webhook().start(async () => undefined)).not.toThrow();
    });
});

describe('cloudflareCron', () => {
    it('has name "cloudflare"', () => {
        expect(cloudflareCron().name).toBe('cloudflare');
    });

    it('start() is a no-op (does not throw)', () => {
        expect(() => cloudflareCron().start(async () => undefined)).not.toThrow();
    });
});
