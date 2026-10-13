import type { ChildProcess, ExecFileSyncOptions, SpawnOptions } from 'node:child_process';
import { execFileSync, spawn } from 'node:child_process';

/**
 * Runs a command as a child process: `run` with its output on this process's
 * terminal, `capture` for its standard output. Every script starts its
 * commands through these, over `node:child_process`, rather than through a
 * library such as `execa` or `zx`.
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

/**
 * Runs `command` to its end and returns its standard output, trimmed. Its
 * standard error goes to this process's, unless `options.stdio` says
 * otherwise. Throws when it exits with any code but 0, or cannot start.
 */
export function capture(
    command: string,
    args: readonly string[],
    options: ExecFileSyncOptions = {}
): string {
    return execFileSync(command, args, {
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 256 * 1024 * 1024,
        ...options,
        encoding: 'utf8',
    }).trim();
}
