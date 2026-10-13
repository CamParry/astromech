/**
 * Stops or signals a child spawned with `detached: true` along with every
 * process it started, since they share its process group, and says whether a
 * group is still running. POSIX only, like the checks.
 */
import type { ChildProcess } from 'node:child_process';
import process from 'node:process';

/**
 * Send SIGTERM to the child's whole process group, then SIGKILL to anything
 * still running after `graceMs`. Resolves once the group is empty or killed.
 */
export async function stopProcessGroup(
    child: ChildProcess,
    graceMs: number
): Promise<void> {
    const { pid } = child;
    if (pid === undefined || !signalGroup(pid, 'SIGTERM')) return;
    const deadline = Date.now() + graceMs;
    // Signal 0 only asks whether any process in the group is still alive.
    while (signalGroup(pid, 0)) {
        if (Date.now() > deadline) {
            signalGroup(pid, 'SIGKILL');
            return;
        }
        await new Promise((fulfil) => setTimeout(fulfil, 100));
    }
}

/** Whether any live process is left in the process group `id`. */
export function processGroupIsRunning(id: number): boolean {
    return signalGroup(id, 0);
}

/**
 * Signal the process group `pid` leads. False when no live process in it is left. macOS
 * answers EPERM, not ESRCH, when the group holds only exited processes their
 * parents have not reaped yet, and every process here runs as this user, so
 * EPERM means the same as ESRCH.
 */
export function signalGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
    try {
        process.kill(-pid, signal);
        return true;
    } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code === 'ESRCH' || code === 'EPERM') return false;
        throw error;
    }
}
