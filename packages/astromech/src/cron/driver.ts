/**
 * The scheduler driver contract: what `scheduler` in the config must provide.
 */

export type SchedulerDriver = {
    readonly name: string;
    /**
     * Begin producing ticks; each tick invokes onTick(now). A driver whose
     * ticks come from outside the process (a platform cron trigger, an HTTP
     * poke) leaves it out.
     */
    start?(onTick: (now: Date) => Promise<void>): void | Promise<void>;
    stop?(): void | Promise<void>;
};
