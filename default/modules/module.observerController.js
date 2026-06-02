/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Version 2.2
 *
 * - Per-room state persisted in Memory.observerState (survives global resets)
 * - Strategic targets sorted by Chebyshev distance per-observer
 * - Chebyshev arithmetic replaces Game.map.getRoomLinearDistance for hot paths
 * - Random fallback skipped briefly after a clean sweep finds nothing stale
 * - Tunables collected in TUNING block
 * - Direction list cached at module scope (includes r=1 corners)
 * - Previous-tick observation always handed to operationPlanner
 */

const profiler = require("tools.profiler");

const TUNING = {
    THROTTLE_TICKS: 5,                    // Min ticks between observation attempts per room
    STALE_INTEL_TICKS: 50,                // Re-observe rooms whose intel is older than this
    EMPTY_SWEEP_BACKOFF_TICKS: 25,        // Skip random fallback for this long after an empty sweep
    PRUNE_INTERVAL_TICKS: 1500,           // Prune lost-room state this often
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
        // Observer results are 1 tick delayed, so the room we asked about last cycle
        // is visible now and needs invaderCheck / cacheRoomIntel via operationPlanner.
        const previous = state.observedRooms[roomName];
        if (previous && Game.rooms[previous]) {
            observer.operationPlanner(Game.rooms[previous]);
            delete state.observedRooms[roomName];
        }

        // Manual observation bypasses the throttle so it responds immediately
        if (Memory.observeRoom) {
            this.handleManualObservation(roomName, observer, state);
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
            this.observeRoom(observer, roomName, targetRoom, currentTime, state);
        }
    }

    handleManualObservation(roomName, observer, state) {
        const target = Memory.observeRoom;

        // We issued this exact target last cycle; the prior-result handler in run()
        // has now processed it. Clear and resume normal mode.
        if (state.manualIssued[roomName] === target) {
            log.a(`${roomName} finished observing ${target} — resuming random mode.`);
            Memory.observeRoom = undefined;
            delete state.manualIssued[roomName];
            return;
        }

        state.observedRooms[roomName] = target;
        state.manualIssued[roomName] = target;
        observer.observeRoom(target);
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

        const targets = Object.keys(Memory.targetRooms || {}).filter(room => {
            const op = Memory.targetRooms[room];
            if (!op) return false;
            const intel = INTEL[room];
            return op.type === 'scout' ||
                !intel ||
                !intel.lastObservation ||
                intel.lastObservation + TUNING.STALE_INTEL_TICKS < currentTime;
        });

        strategicCache = {tick: currentTime, targets};
        return targets;
    }

    findRandomTarget(roomName, currentTime, state) {
        // Skip the walk for a while after a clean sweep — every nearby room is fresh
        // so re-walking would do hundreds of roomStatus calls for nothing.
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

            const intel = INTEL[target];
            if (!intel || !intel.lastObservation || intel.lastObservation + TUNING.STALE_INTEL_TICKS <= currentTime) {
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
            // Cardinals
            dirs.push([r, 0], [-r, 0], [0, r], [0, -r]);

            // Edge intermediates (between cardinals and the r,r corners)
            for (let i = 1; i < r; i++) {
                dirs.push([r, i], [r, -i], [-r, i], [-r, -i]);
                dirs.push([i, r], [-i, r], [i, -r], [-i, -r]);
            }

            // Corner diagonals (includes r=1 corners)
            dirs.push([r, r], [-r, r], [-r, -r], [r, -r]);
        }
        return dirs;
    }

    observeRoom(observer, roomName, targetRoom, currentTime, state) {
        observer.observeRoom(targetRoom);
        state.observedRooms[roomName] = targetRoom;

        if (!INTEL[targetRoom]) INTEL[targetRoom] = {};
        INTEL[targetRoom].lastObservation = currentTime;
    }

    getState() {
        if (!Memory.observerState) Memory.observerState = {};
        const s = Memory.observerState;
        if (!s.observedRooms) s.observedRooms = {};
        if (!s.manualIssued) s.manualIssued = {};
        if (!s.lastRun) s.lastRun = {};
        if (!s.lastEmptySweep) s.lastEmptySweep = {};
        return s;
    }

    pruneState(state) {
        const owned = global.MY_ROOMS;
        if (!owned || !owned.length) return;
        const ownedSet = new Set(owned);
        for (const bucket of [state.observedRooms, state.manualIssued, state.lastRun, state.lastEmptySweep]) {
            for (const name in bucket) {
                if (!ownedSet.has(name)) delete bucket[name];
            }
        }
    }
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
