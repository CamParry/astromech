import type {
    ChildProcess,
    ExecFileSyncOptions,
    SpawnOptions,
    SpawnSyncOptions,
} from 'node:child_process';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

/**
 * Runs a command as a child process: `run` with its output on this process's
 * terminal, `capture` for its standard output, `succeeds` for whether it
 * exited with 0, and `start` with its output kept, for a server or a command
 * whose output is printed only on a failure.
 * Every script starts its commands through these, over `node:child_process`,
 * rather than through a library such as `execa` or `zx`.
 */

export type RunOptions = SpawnOptions & {
    /** Receives the child process once it is spawned, to stop it or record its group. */
    onSpawn?: (child: ChildProcess) => void;
};

/**
 * Runs `command` to its end with its output inherited, unless `options.stdio`
 * says otherwise. Resolves when it exits with 0, and rejects when it exits
 * with any other code, is stopped by a signal, or cannot start.
 */
export function run(
    command: string,
    args: readonly string[],
    { onSpawn, ...options }: RunOptions = {}
): Promise<void> {
    return new Promise((fulfil, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', ...options });
        onSpawn?.(child);
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (code === 0) fulfil();
            else
                reject(
                    new Error(
                        `${command} ${args.join(' ')} exited with ${code ?? signal}`
                    )
                );
        });
    });
}

/** A process `start` began: its output so far, and how it ended once it has. */
export type StartedProcess = {
    readonly child: ChildProcess;
    /** Its standard output and standard error so far, as they arrived. */
    output: string;
    /** Its exit code, or the signal that stopped it, once it has exited. */
    exited?: number | NodeJS.Signals;
    /**
     * Fulfils when it exits with 0, and rejects when it exits with any other
     * code, is stopped by a signal, or cannot start.
     */
    readonly done: Promise<void>;
};

export type StartOptions = SpawnOptions & {
    /** Written to its standard input, which is then closed. */
    input?: string;
};

/**
 * Starts `command` with its standard output and standard error captured into
 * `output` rather than printed, for a server a check serves from or a command
 * whose output is printed only when the check fails. Its standard input gets
 * `options.input`, or nothing. Await `done` to wait for its end.
 */
export function start(
    command: string,
    args: readonly string[],
    { input, ...options }: StartOptions = {}
): StartedProcess {
    const child = spawn(command, args, {
        ...options,
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    if (input !== undefined) child.stdin?.end(input);
    const started: StartedProcess = {
        child,
        output: '',
        done: new Promise((fulfil, reject) => {
            child.on('error', reject);
            // `close` comes once its output is all read, which can be after
            // `exit` when a process it started still holds the pipes.
            child.on('close', (code, signal) => {
                if (code === 0) fulfil();
                else
                    reject(
                        new Error(
                            `${command} ${args.join(' ')} exited with ${code ?? signal}`
                        )
                    );
            });
        }),
    };
    // A server stopped at the end of a check exits with a signal, and nothing
    // awaits its end, so that rejection is not an unhandled one.
    started.done.catch(() => undefined);
    child.on('exit', (code, signal) => {
        started.exited = code ?? signal ?? undefined;
    });
    const record = (chunk: Buffer): void => {
        started.output += chunk.toString();
    };
    child.stdout?.on('data', record);
    child.stderr?.on('data', record);
    return started;
}

export type CaptureOptions = Omit<ExecFileSyncOptions, 'stdio' | 'encoding'> & {
    /**
     * Where its standard error goes: to this process's (the default), nowhere,
     * or into a pipe nothing reads.
     */
    stderr?: 'inherit' | 'ignore' | 'pipe';
};

/**
 * Runs `command` to its end and returns its standard output, trimmed. Its
 * standard error goes to this process's, unless `options.stderr` says
 * otherwise. Throws when it exits with any code but 0, or cannot start.
 *
 * Its standard output is always read, so it takes no `stdio`: a call that
 * needs only whether a command succeeded uses `succeeds`.
 */
export function capture(
    command: string,
    args: readonly string[],
    { stderr = 'inherit', ...options }: CaptureOptions = {}
): string {
    return execFileSync(command, args, {
        maxBuffer: 256 * 1024 * 1024,
        ...options,
        stdio: ['ignore', 'pipe', stderr],
        encoding: 'utf8',
    }).trim();
}

/**
 * Runs `command` to its end with its output dropped, and returns whether it
 * exited with 0. False when it exits with any other code, is stopped by a
 * signal, or cannot start.
 */
export function succeeds(
    command: string,
    args: readonly string[],
    options: Omit<SpawnSyncOptions, 'stdio'> = {}
): boolean {
    return spawnSync(command, args, { ...options, stdio: 'ignore' }).status === 0;
}
