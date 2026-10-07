/**
 * Stops or signals a child spawned with `detached: true` along with every
 * process it started, since they share its process group, and says whether a
 * group is still running. POSIX only, like the checks.
 */

/**
 * Send SIGTERM to the child's whole process group, then SIGKILL to anything
 * still running after `graceMs`. Resolves once the group is empty or killed.
 */
export async function stopProcessGroup(child, graceMs) {
    if (!signalGroup(child.pid, 'SIGTERM')) return;
    const deadline = Date.now() + graceMs;
    // Signal 0 only asks whether any process in the group is still alive.
    while (signalGroup(child.pid, 0)) {
        if (Date.now() > deadline) {
            signalGroup(child.pid, 'SIGKILL');
            return;
        }
        await new Promise((fulfil) => setTimeout(fulfil, 100));
    }
}

/** Whether any live process is left in the process group `id`. */
export function processGroupIsRunning(id) {
    return signalGroup(id, 0);
}

/**
 * Signal the process group `pid` leads. False when no live process in it is left. macOS
 * answers EPERM, not ESRCH, when the group holds only exited processes their
 * parents have not reaped yet, and every process here runs as this user, so
 * EPERM means the same as ESRCH.
 */
export function signalGroup(pid, signal) {
    try {
        process.kill(-pid, signal);
        return true;
    } catch (error) {
        if (error.code === 'ESRCH' || error.code === 'EPERM') return false;
        throw error;
    }
}
