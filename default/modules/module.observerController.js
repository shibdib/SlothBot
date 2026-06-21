/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Version 2.5
 *
 * - Strategic picks use global priority then Chebyshev distance (not distance-only)
 * - Cross-observer dedup: skip rooms already in-flight on any observer
 * - Cross-observer recently-observed TTL: skip rooms another observer refreshed recently
 * - Strategic picks skip fresh intel unless priority >= HIGH_PRIORITY
 * - Heavy intel refresh for claim corridor / expansion scouts (hubCheck + cached)
 * - Highway, active remotes, early-warning exits, and auxiliary scout ops in target pool
 * - Background/exploratory sweep now reliably refreshes very old intel (BACKGROUND_STALE_TICKS window)
 * - Throttled low-prio strategic work opportunistically yields to oldest-intel maintenance
 * - Border-fill low-prio now only for truly background-stale neighbors (prevents starving distant old intel)
 * - High-priority reachable work bypasses throttle
 * - Skip rooms with live creep vision (owned rooms + any room with my creeps)
 */

const profiler = require("tools.profiler");

const TUNING = {
    THROTTLE_TICKS: 5,
    STALE_INTEL_TICKS: 50,            // short window for *reactive* / hot intel (power, threats, active remotes)
    BACKGROUND_STALE_TICKS: 5000,     // rooms with intel older than this (~hours) are eligible for background/exploratory refresh
    EMPTY_SWEEP_BACKOFF_TICKS: 25,
    PRUNE_INTERVAL_TICKS: 1500,
    MAX_OBSERVE_RETRIES: 3,
    HIGH_PRIORITY: 85,
    RECENTLY_OBSERVED_TICKS: 75,
    HIGH_STRATEGIC_FOR_RANDOM: 50,    // below this, prefer background oldest-intel maintenance over low-prio strategic
    HEAVY_INTEL_TICKS: CREEP_LIFE_TIME * 5,
    ACTIVE_REMOTE_WINDOW: 500,
};

let cachedDirections = null;
let strategicCache = {tick: 0, targets: [], priorityByRoom: {}};
let creepVisionCache = {tick: 0, rooms: null};

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

        if (!this.processPreviousObservation(roomName, observer, state, currentTime)) return;

        const manualTarget = this.getManualTarget(state);
        if (manualTarget && this.resolveManualHandler(state, currentTime) === roomName) {
            this.handleManualObservation(roomName, observer, state, manualTarget);
            return;
        }

        const reachable = this.getReachableStrategic(roomName, currentTime, state);
        const priorities = this.getStrategicPriorities(currentTime);
        const topPriority = reachable.length ? (priorities[reachable[0]] || 0) : 0;
        const throttled = (state.lastRun[roomName] | 0) + TUNING.THROTTLE_TICKS > currentTime;

        // High priority strategic work bypasses throttle (as before).
        if (throttled && topPriority >= TUNING.HIGH_PRIORITY) {
            // fall through to pick it
        } else if (throttled && topPriority > 0 && topPriority < TUNING.HIGH_STRATEGIC_FOR_RANDOM) {
            // Throttled + only low/medium strategic work available.
            // Prefer background oldest-intel maintenance (exploratory refresh of ancient rooms)
            // over burning the observe on yet another low-prio border/op target.
            // This is the main fix for "36d old room in range but never observed".
            const maint = this.findOldestIntelTarget(roomName, currentTime, state);
            if (maint) {
                state.lastRun[roomName] = currentTime;
                if (!hasCreepVision(maint, currentTime)) {
                    this.issueObservation(observer, roomName, maint, state);
                }
                return;
            }
            // no good maintenance target right now — fall through and do the low strategic
        } else if (throttled) {
            // throttled and nothing strategic at all this tick — still allow occasional maintenance
            const maint = this.findOldestIntelTarget(roomName, currentTime, state);
            if (maint) {
                state.lastRun[roomName] = currentTime;
                if (!hasCreepVision(maint, currentTime)) {
                    this.issueObservation(observer, roomName, maint, state);
                }
                return;
            }
            return; // nothing to do
        }

        state.lastRun[roomName] = currentTime;

        let targetRoom = reachable.length ? reachable[0] : this.findOldestIntelTarget(roomName, currentTime, state);

        if (targetRoom && !hasCreepVision(targetRoom, currentTime)) {
            this.issueObservation(observer, roomName, targetRoom, state);
        }
    }

    processPreviousObservation(roomName, observer, state, currentTime) {
        const previous = state.observedRooms[roomName];
        if (!previous) return true;

        const observed = Game.rooms[previous];
        if (observed) {
            const priorities = this.getStrategicPriorities(currentTime);
            const priority = priorities[previous] || 0;
            const forceHeavy = priority >= 88 || needsHeavyIntel(INTEL[previous], currentTime);
            observed.cacheRoomIntel(forceHeavy);
            observer.operationPlanner(observed);
            markRecentlyObserved(state, previous, currentTime);
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
        if (state.manualIssued[roomName] === target) {
            log.a(`${roomName} finished observing ${target} — resuming random mode.`);
            this.clearManualRequest(state, roomName);
            return;
        }

        this.issueObservation(observer, roomName, target, state);
        state.manualIssued[roomName] = target;
    }

    getReachableStrategic(roomName, currentTime, state) {
        const base = parseRoomName(roomName);
        if (!base) return [];

        const priorities = this.getStrategicPriorities(currentTime);
        const inFlight = getInFlightTargets(state);
        const reachable = [];

        for (const target of strategicCache.targets) {
            const pos = parseRoomName(target);
            if (!pos) continue;
            if (hasCreepVision(target, currentTime)) continue;
            if (inFlight.has(target)) continue;
            if (isRecentlyObserved(target, currentTime, state)) continue;
            const priority = priorities[target] || 0;
            if (priority < TUNING.HIGH_PRIORITY && !isIntelStale(INTEL[target], currentTime)) continue;
            const dist = chebyshev(base, pos);
            if (dist > OBSERVER_RANGE) continue;
            if (roomStatus(target) === 'closed') continue;
            reachable.push({target, dist, priority});
        }

        reachable.sort((a, b) => b.priority - a.priority || a.dist - b.dist);
        return reachable.map(r => r.target);
    }

    getStrategicPriorities(currentTime) {
        if (strategicCache.tick === currentTime && strategicCache.priorityByRoom) {
            return strategicCache.priorityByRoom;
        }
        this.buildStrategicCache(currentTime);
        return strategicCache.priorityByRoom;
    }

    buildStrategicCache(currentTime) {
        const creepVision = getRoomsWithMyCreeps(currentTime);
        const owned = global.MY_ROOMS || [];
        const priorityByRoom = {};
        const add = (room, priority) => {
            if (!room || roomStatus(room) === 'closed') return;
            if (owned.includes(room) || creepVision.has(room)) return;
            if (!priorityByRoom[room] || priorityByRoom[room] < priority) priorityByRoom[room] = priority;
        };

        const claim = Memory.claimTarget?.room;
        if (claim) {
            add(claim, 100);
            for (const neighbor of Object.values(Game.map.describeExits(claim) || {})) {
                add(neighbor, 90);
                if (needsHeavyIntel(INTEL[neighbor], currentTime)) add(neighbor, 92);
            }
            if (needsHeavyIntel(INTEL[claim], currentTime)) add(claim, 102);
        }

        for (const roomName of Memory.expansionScoutRooms || []) {
            add(roomName, 88);
            if (needsHeavyIntel(INTEL[roomName], currentTime)) add(roomName, 91);
        }

        // Use pre-built indexes (one INTEL walk per tick, shared) instead of full scan every rebuild
        const idx = global.getIntelIndexes ? global.getIntelIndexes(currentTime) : {
            requestingSupport: [],
            threats: [],
            invaderCores: [],
            power: [],
            commodity: [],
            activeRemotes: []
        };
        const ct = currentTime;
        for (const rName of (idx.requestingSupport || [])) {
            const r = INTEL[rName];
            if (r) add(rName, 95);
        }
        for (const rName of (idx.threats || [])) {
            const r = INTEL[rName];
            if (r && r.threatLevel > 3) add(rName, 82);
        }
        for (const rName of (idx.invaderCores || [])) {
            const r = INTEL[rName];
            if (r && r.invaderCore && r.invaderCore > ct) add(rName, 78);
        }
        for (const rName of (idx.power || [])) {
            const r = INTEL[rName];
            if (r && r.power && r.power > ct) add(rName, 70);
        }
        for (const rName of (idx.commodity || [])) {
            const r = INTEL[rName];
            if (r) add(rName, 68);
        }
        for (const rName of (idx.activeRemotes || [])) {
            const r = INTEL[rName];
            if (r && r.activeRemote && r.activeRemote + TUNING.ACTIVE_REMOTE_WINDOW > ct &&
                (r.threatLevel > 0 || r.armedHostile) && isIntelStale(r, ct)) {
                add(rName, 76);
            }
        }

        for (const home of global.MY_ROOMS || []) {
            const hr = Game.rooms[home];
            if (!hr) continue;
            if (hr.memory?.borderPatrol) add(hr.memory.borderPatrol, 72);
            if (hr.memory?.earlyWarning) {
                for (const neighbor of Object.values(Game.map.describeExits(home) || {})) {
                    if (isIntelStale(INTEL[neighbor], currentTime)) add(neighbor, 74);
                }
            }
        }

        for (const room of [
            ...Object.keys(Memory.targetRooms || {}),
            ...Object.keys(Memory.auxiliaryTargets || {}),
        ]) {
            const op = Memory.targetRooms[room] || Memory.auxiliaryTargets[room];
            if (!op) continue;
            if (op.type === 'scout' || op.type === 'claim') add(room, 66);
            else if (isIntelStale(INTEL[room], currentTime)) add(room, 60);
            else if (needsHeavyIntel(INTEL[room], currentTime)) add(room, 62);
        }

        // Fill map toward owned rooms: only *background* stale neighbors get low priority.
        // Using the short isIntelStale here would constantly feed low-prio work and starve
        // exploratory refresh of truly ancient intel deeper in observer range.
        for (const home of global.MY_ROOMS || []) {
            for (const neighbor of Object.values(Game.map.describeExits(home) || {})) {
                const ni = INTEL[neighbor];
                if (ni && ni.lastObservation && (currentTime - ni.lastObservation > TUNING.BACKGROUND_STALE_TICKS)) {
                    add(neighbor, 35);
                }
            }
        }

        const targets = Object.keys(priorityByRoom).sort((a, b) => priorityByRoom[b] - priorityByRoom[a]);
        strategicCache = {tick: currentTime, targets, priorityByRoom};
    }

    findOldestIntelTarget(roomName, currentTime, state) {
        // Background / exploratory: pick the oldest intel (by lastObservation) within observer range
        // that hasn't been seen recently enough for map maintenance purposes.
        // This is the path that should eventually catch 36-day-old rooms when no high-priority
        // strategic work is available for this observer.
        const lastEmpty = state.lastEmptySweep[roomName] | 0;
        if (lastEmpty && currentTime - lastEmpty < TUNING.EMPTY_SWEEP_BACKOFF_TICKS) {
            return null;
        }

        const base = parseRoomName(roomName);
        if (!base) return null;

        const inFlight = getInFlightTargets(state);
        const directions = this.getDirections();
        const candidates = [];

        // We walk the full set of rooms in range. Rotation is no longer needed because we
        // collect *all* qualifying rooms then pick the globally oldest by lastObservation.
        for (const [dx, dy] of directions) {
            const target = formatRoomName(base.x + dx, base.y + dy);

            if (roomStatus(target) === 'closed') continue;
            if (hasCreepVision(target, currentTime)) continue;
            if (inFlight.has(target)) continue;
            if (isRecentlyObserved(target, currentTime, state)) continue;

            const intel = INTEL[target];
            // Background maintenance: only rooms whose intel is older than the background window
            // (or never observed) are candidates. We want the *oldest* one in the whole range.
            const age = intel?.lastObservation || 0;
            if (age && (currentTime - age < TUNING.BACKGROUND_STALE_TICKS)) continue;

            candidates.push({target, age});
        }

        if (!candidates.length) {
            state.lastEmptySweep[roomName] = currentTime;
            return null;
        }

        delete state.lastEmptySweep[roomName];
        candidates.sort((a, b) => a.age - b.age); // oldest (smallest timestamp or 0=never) first
        return candidates[0].target;
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
        if (!s.recentlyObserved) s.recentlyObserved = {};
        return s;
    }

    pruneState(state) {
        const owned = global.MY_ROOMS;
        if (!owned || !owned.length) return;
        const ownedSet = new Set(owned);
        pruneRecentlyObserved(state, Game.time);
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

function getRoomsWithMyCreeps(currentTime) {
    if (creepVisionCache.tick === currentTime && creepVisionCache.rooms) {
        return creepVisionCache.rooms;
    }
    const rooms = new Set(global.MY_ROOMS || []);
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.my) rooms.add(creep.pos.roomName);
    }
    creepVisionCache = {tick: currentTime, rooms};
    return rooms;
}

function hasCreepVision(roomName, currentTime) {
    return getRoomsWithMyCreeps(currentTime).has(roomName);
}

function getInFlightTargets(state) {
    const inFlight = new Set();
    const bucket = state.observedRooms;
    if (!bucket) return inFlight;
    for (const observerRoom in bucket) {
        const target = bucket[observerRoom];
        if (target) inFlight.add(target);
    }
    return inFlight;
}


function markRecentlyObserved(state, targetRoom, currentTime) {
    if (!state.recentlyObserved) state.recentlyObserved = {};
    state.recentlyObserved[targetRoom] = currentTime;
}

function pruneRecentlyObserved(state, currentTime) {
    const bucket = state.recentlyObserved;
    if (!bucket) return;
    for (const roomName in bucket) {
        if (currentTime - (bucket[roomName] | 0) > TUNING.RECENTLY_OBSERVED_TICKS) {
            delete bucket[roomName];
        }
    }
}

function isRecentlyObserved(target, currentTime, state) {
    const bucket = state.recentlyObserved;
    if (!bucket) return false;
    const tick = bucket[target];
    if (!tick) return false;
    if (currentTime - tick > TUNING.RECENTLY_OBSERVED_TICKS) {
        delete bucket[target];
        return false;
    }
    return true;
}
function isIntelStale(intel, currentTime) {
    // Short-horizon "reactive" staleness for urgent things (power banks, active threats, etc.).
    // Background/exploratory maintenance of ancient intel uses BACKGROUND_STALE_TICKS instead.
    return !intel ||
        !intel.lastObservation ||
        intel.lastObservation + TUNING.STALE_INTEL_TICKS <= currentTime;
}

function needsHeavyIntel(intel, currentTime) {
    if (!intel) return true;
    if (!intel.cached || intel.cached + TUNING.HEAVY_INTEL_TICKS <= currentTime) return true;
    if (!intel.owner && !intel.hubCheck && (intel.sources === 2 || intel.sources === undefined)) return true;
    return false;
}

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
