/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Version 2.3
 *
 * - Per-room state persisted in Memory.observerState (survives global resets)
 * - Strategic targets sorted by Chebyshev distance per-observer
 * - Chebyshev arithmetic replaces Game.map.getRoomLinearDistance for hot paths
 * - Random fallback skipped briefly after a clean sweep finds nothing stale
 * - Tunables collected in TUNING block
 * - Direction list cached at module scope (includes r=1 corners)
 * - Previous-tick observation always handed to operationPlanner
 * - lastObservation only updated when vision lands (cacheRoomIntel)
 * - Manual observe assigned to nearest in-range observer
 */

const profiler = require("tools.profiler");

const TUNING = {
    THROTTLE_TICKS: 5,                    // Min ticks between observation attempts per room
    STALE_INTEL_TICKS: 50,                // Re-observe rooms whose intel is older than this
    EMPTY_SWEEP_BACKOFF_TICKS: 25,        // Skip random fallback for this long after an empty sweep
    PRUNE_INTERVAL_TICKS: 1500,           // Prune lost-room state this often
    MAX_OBSERVE_RETRIES: 3,               // Re-issue observeRoom if vision is still missing
};

let cachedDirections = null;
let strategicCache = {tick: 0, targets: []};

class ObserverControl {
    constructor() {
    }

    run(room) {
        const observer = room.observer;
        if (!observer) return;

        const roomName = room.name;
        const currentTime = Game.time;
        const state = this.getState();

        if (currentTime - (state.lastPrune | 0) > TUNING.PRUNE_INTERVAL_TICKS) {
            this.pruneState(state);
            state.lastPrune = currentTime;
        }

        // Always process the prior tick's observation result first.
        if (!this.processPreviousObservation(roomName, observer, state)) return;

        const manualTarget = this.getManualTarget(state);
        if (manualTarget && this.resolveManualHandler(state, currentTime) === roomName) {
            this.handleManualObservation(roomName, observer, state, manualTarget);
            return;
        }

        // Throttle per room, but bypass when this observer has reachable strategic work
        const reachable = this.getReachableStrategic(roomName, currentTime);
        const throttled = (state.lastRun[roomName] | 0) + TUNING.THROTTLE_TICKS > currentTime;
        if (throttled && reachable.length === 0) return;
        state.lastRun[roomName] = currentTime;

        const targetRoom = reachable.length
            ? reachable[0]
            : this.findRandomTarget(roomName, currentTime, state);

        if (targetRoom) {
            this.issueObservation(observer, roomName, targetRoom, state);
        }
    }

    processPreviousObservation(roomName, observer, state) {
        const previous = state.observedRooms[roomName];
        if (!previous) return true;

        const observed = Game.rooms[previous];
        if (observed) {
            observer.operationPlanner(observed);
            delete state.observedRooms[roomName];
            delete state.observeAttempts[roomName];
            return true;
        }

        const attempts = (state.observeAttempts[roomName] | 0) + 1;
        if (attempts > TUNING.MAX_OBSERVE_RETRIES) {
            delete state.observedRooms[roomName];
            delete state.observeAttempts[roomName];
            return true;
        }

        state.observeAttempts[roomName] = attempts;
        observer.observeRoom(previous);
        return false;
    }

    getManualTarget(state) {
        if (Memory.observeRoom) {
            state.manualTarget = Memory.observeRoom;
            Memory.observeRoom = undefined;
            delete state.manualHandler;
            delete state.manualHandlerTick;
        }
        return state.manualTarget;
    }

    resolveManualHandler(state, currentTime) {
        const target = state.manualTarget;
        if (!target) return null;

        if (state.manualHandler && state.manualHandlerTick === currentTime) {
            return state.manualHandler;
        }

        const targetPos = parseRoomName(target);
        if (!targetPos) return null;

        let best = null;
        let bestDist = Infinity;
        const owned = global.MY_ROOMS || [];

        for (const home of owned) {
            const homeRoom = Game.rooms[home];
            if (!homeRoom?.observer) continue;
            const base = parseRoomName(home);
            if (!base) continue;
            const dist = chebyshev(base, targetPos);
            if (dist > OBSERVER_RANGE) continue;
            if (dist < bestDist || (dist === bestDist && (!best || home < best))) {
                bestDist = dist;
                best = home;
            }
        }

        state.manualHandler = best;
        state.manualHandlerTick = currentTime;
        return best;
    }

    clearManualRequest(state, roomName) {
        delete state.manualTarget;
        delete state.manualHandler;
        delete state.manualHandlerTick;
        delete state.manualIssued[roomName];
        Memory.observeRoom = undefined;
    }

    handleManualObservation(roomName, observer, state, target) {
        // Prior-result handler processed the manual target; resume auto mode.
        if (state.manualIssued[roomName] === target) {
            log.a(`${roomName} finished observing ${target} — resuming random mode.`);
            this.clearManualRequest(state, roomName);
            return;
        }

        this.issueObservation(observer, roomName, target, state);
        state.manualIssued[roomName] = target;
    }

    getReachableStrategic(roomName, currentTime) {
        const base = parseRoomName(roomName);
        if (!base) return [];

        const all = this.getStrategicTargets(currentTime);
        const reachable = [];
        for (const target of all) {
            const pos = parseRoomName(target);
            if (!pos) continue;
            const dist = chebyshev(base, pos);
            if (dist > OBSERVER_RANGE) continue;
            if (roomStatus(target) === 'closed') continue;
            reachable.push({target, dist});
        }
        reachable.sort((a, b) => a.dist - b.dist);
        return reachable.map(r => r.target);
    }

    getStrategicTargets(currentTime) {
        if (strategicCache.tick === currentTime) {
            return strategicCache.targets;
        }

        const rooms = new Set([
            ...Object.keys(Memory.targetRooms || {}),
            ...Object.keys(Memory.auxiliaryTargets || {}),
        ]);

        const targets = [...rooms].filter(room => {
            const op = Memory.targetRooms[room] || Memory.auxiliaryTargets[room];
            if (!op) return false;
            if (op.type === 'scout') return true;
            return isIntelStale(INTEL[room], currentTime);
        });

        strategicCache = {tick: currentTime, targets};
        return targets;
    }

    findRandomTarget(roomName, currentTime, state) {
        const lastEmpty = state.lastEmptySweep[roomName] | 0;
        if (lastEmpty && currentTime - lastEmpty < TUNING.EMPTY_SWEEP_BACKOFF_TICKS) {
            return null;
        }

        const base = parseRoomName(roomName);
        if (!base) return null;

        for (const [dx, dy] of this.getDirections()) {
            const newX = base.x + dx;
            const newY = base.y + dy;
            const target = formatRoomName(newX, newY);

            if (roomStatus(target) === 'closed') continue;
            if (isIntelStale(INTEL[target], currentTime)) {
                delete state.lastEmptySweep[roomName];
                return target;
            }
        }

        state.lastEmptySweep[roomName] = currentTime;
        return null;
    }

    getDirections() {
        if (!cachedDirections) {
            cachedDirections = this.generateDirections(OBSERVER_RANGE);
        }
        return cachedDirections;
    }

    generateDirections(maxRange) {
        const dirs = [];
        for (let r = 1; r <= maxRange; r++) {
            dirs.push([r, 0], [-r, 0], [0, r], [0, -r]);

            for (let i = 1; i < r; i++) {
                dirs.push([r, i], [r, -i], [-r, i], [-r, -i]);
                dirs.push([i, r], [-i, r], [i, -r], [-i, -r]);
            }

            dirs.push([r, r], [-r, r], [-r, -r], [r, -r]);
        }
        return dirs;
    }

    issueObservation(observer, roomName, targetRoom, state) {
        observer.observeRoom(targetRoom);
        state.observedRooms[roomName] = targetRoom;
    }

    getState() {
        if (!Memory.observerState) Memory.observerState = {};
        const s = Memory.observerState;
        if (!s.observedRooms) s.observedRooms = {};
        if (!s.manualIssued) s.manualIssued = {};
        if (!s.lastRun) s.lastRun = {};
        if (!s.lastEmptySweep) s.lastEmptySweep = {};
        if (!s.observeAttempts) s.observeAttempts = {};
        return s;
    }

    pruneState(state) {
        const owned = global.MY_ROOMS;
        if (!owned || !owned.length) return;
        const ownedSet = new Set(owned);
        for (const bucket of [
            state.observedRooms,
            state.manualIssued,
            state.lastRun,
            state.lastEmptySweep,
            state.observeAttempts,
        ]) {
            if (!bucket) continue;
            for (const name in bucket) {
                if (!ownedSet.has(name)) delete bucket[name];
            }
        }
        if (state.manualHandler && !ownedSet.has(state.manualHandler)) {
            delete state.manualHandler;
            delete state.manualHandlerTick;
        }
    }
}

function isIntelStale(intel, currentTime) {
    return !intel ||
        !intel.lastObservation ||
        intel.lastObservation + TUNING.STALE_INTEL_TICKS <= currentTime;
}

// Parse "E5N3" → {x: 5, y: -3}. E/S positive, W/N negative. Chebyshev distance
// then matches Game.map.getRoomLinearDistance on standard (non-wrapping) worlds.
function parseRoomName(name) {
    const m = name.match(/^([EW])(\d+)([NS])(\d+)$/);
    if (!m) return null;
    return {
        x: (m[1] === 'W' ? -1 : 1) * (m[2] | 0),
        y: (m[3] === 'N' ? -1 : 1) * (m[4] | 0),
    };
}

function formatRoomName(x, y) {
    return `${x >= 0 ? 'E' : 'W'}${Math.abs(x)}${y >= 0 ? 'S' : 'N'}${Math.abs(y)}`;
}

function chebyshev(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

profiler.registerClass(ObserverControl, 'ObserverControl');
module.exports = ObserverControl;