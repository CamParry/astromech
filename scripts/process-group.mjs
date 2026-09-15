/**
 * Stops a child spawned with `detached: true` along with every process it
 * started, since they share its process group. POSIX only, like the checks.
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

/** Signal a process group. False when no process in it is left. */
function signalGroup(pid, signal) {
    try {
        process.kill(-pid, signal);
        return true;
    } catch (error) {
        if (error.code === 'ESRCH') return false;
        throw error;
    }
}
