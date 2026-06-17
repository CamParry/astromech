import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeDriver } from '@/cron/drivers/node.js';
import { httpDriver } from '@/cron/drivers/http.js';
import { cloudflareDriver } from '@/cron/drivers/cloudflare.js';

describe('nodeDriver', () => {
    beforeEach(() => {
        globalThis.__astromechCronInterval = undefined;
        vi.useFakeTimers();
    });

    afterEach(() => {
        nodeDriver.stop?.();
        globalThis.__astromechCronInterval = undefined;
        vi.useRealTimers();
    });

    it('has name "node"', () => {
        expect(nodeDriver.name).toBe('node');
    });

    it('invokes onTick with a Date after 60 seconds', async () => {
        const ticks: Date[] = [];
        const onTick = vi.fn(async (now: Date) => {
            ticks.push(now);
        });

        nodeDriver.start(onTick);
        expect(onTick).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(60_000);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(ticks[0]).toBeInstanceOf(Date);
    });

    it('calling start() twice does not stack intervals', async () => {
        const onTick = vi.fn(async (_now: Date) => undefined);

        nodeDriver.start(onTick);
        nodeDriver.start(onTick);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(onTick).toHaveBeenCalledTimes(1);
    });

    it('stop() clears the interval', async () => {
        const onTick = vi.fn(async (_now: Date) => undefined);

        nodeDriver.start(onTick);
        nodeDriver.stop?.();

        await vi.advanceTimersByTimeAsync(120_000);
        expect(onTick).not.toHaveBeenCalled();
        expect(globalThis.__astromechCronInterval).toBeUndefined();
    });
});

describe('httpDriver', () => {
    it('has name "http"', () => {
        expect(httpDriver.name).toBe('http');
    });

    it('start() is a no-op (does not throw)', () => {
        expect(() => httpDriver.start(async () => undefined)).not.toThrow();
    });
});

describe('cloudflareDriver', () => {
    it('has name "cloudflare"', () => {
        expect(cloudflareDriver.name).toBe('cloudflare');
    });

    it('start() is a no-op (does not throw)', () => {
        expect(() => cloudflareDriver.start(async () => undefined)).not.toThrow();
    });
});
