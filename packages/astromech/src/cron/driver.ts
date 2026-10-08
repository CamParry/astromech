/**
 * The scheduler driver contract: what `scheduler` in the config must provide.
 */

export type SchedulerDriver = {
    readonly name: string;
    /** Begin producing ticks; each tick invokes onTick(now). */
    start(onTick: (now: Date) => Promise<void>): void | Promise<void>;
    stop?(): void | Promise<void>;
};
