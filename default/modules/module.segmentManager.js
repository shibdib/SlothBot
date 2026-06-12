/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// 0-3 intel | 69 path | 70 routes | 77 public ally requests
const INTEL_SEGMENTS = [0, 1, 2, 3];
const activeSegments = [...INTEL_SEGMENTS, 69, 70, 77];
const publicSegments = [77];

const DEFAULT_ALLY_REQUESTS = () => ({
    requests: {
        resource: [],
        defense: [],
        attack: [],
        player: [],
        work: [],
        funnel: [],
        room: []
    }
});

function isValidIntel() {
    if (!global.INTEL || !_.size(INTEL)) return false;
    for (const roomName in INTEL) {
        const entry = INTEL[roomName];
        if (entry && entry.name) return true;
    }
    return false;
}

function clearIntelSegments() {
    for (const id of INTEL_SEGMENTS) {
        RawMemory.segments[id] = '';
    }
}

function parseAllyRequests(raw) {
    if (!raw) return null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && parsed.requests && typeof parsed.requests === 'object') return parsed;
    } catch (e) {
        log.d(`Invalid ally request segment data: ${e}`, 'SEGMENT MANAGER: ');
    }
    return null;
}

function ensureMyAllyRequests() {
    if (!ALLY_HELP_REQUESTS[MY_USERNAME]) ALLY_HELP_REQUESTS[MY_USERNAME] = DEFAULT_ALLY_REQUESTS();
    if (!ALLY_HELP_REQUESTS[MY_USERNAME].requests) ALLY_HELP_REQUESTS[MY_USERNAME].requests = DEFAULT_ALLY_REQUESTS().requests;
}

function readForeignAllyRequests() {
    const foreign = RawMemory.foreignSegment;
    if (!foreign || !FRIENDLIES.includes(foreign.username) || foreign.id !== 77) return;
    const parsed = parseAllyRequests(foreign.data);
    if (parsed) ALLY_HELP_REQUESTS[foreign.username] = parsed;
}

function scheduleForeignAllyRead() {
    const filtered = _.filter(FRIENDLIES, (f) => f !== MY_USERNAME);
    if (!filtered.length) return;
    try {
        RawMemory.setActiveForeignSegment(filtered[Game.time % filtered.length], 77);
    } catch (e) {
    }
}

module.exports.init = function () {
    RawMemory.setActiveSegments(activeSegments);
    RawMemory.setPublicSegments(publicSegments);
    RawMemory.setDefaultPublicSegment(publicSegments[0]);

    if (global.LOAN_CHECK) {
        readForeignAllyRequests();
        scheduleForeignAllyRead();
        ensureMyAllyRequests();
    }
};

module.exports.storeAllyRequests = function () {
    if (!global.LOAN_CHECK) return;
    ensureMyAllyRequests();
    try {
        RawMemory.segments[77] = JSON.stringify(ALLY_HELP_REQUESTS[MY_USERNAME]);
    } catch (e) {
        log.e(`Error storing ally requests: ${e}`, 'SEGMENT MANAGER: ');
    }
};

let intelSegmentChecked;
let intelCheckCounter = 0;

module.exports.retrieveIntel = function () {
    if (intelSegmentChecked) return true;

    if (intelCheckCounter < 5) {
        if (Memory.intelVersion === INTEL_VERSION) {
            let allAccessible = true;
            for (const id of INTEL_SEGMENTS) {
                if (RawMemory.segments[id] === undefined) {
                    allAccessible = false;
                    break;
                }
            }

            if (allAccessible) {
                intelSegmentChecked = true;
                intelCheckCounter = 0;
                global.INTEL = {};
                for (const id of INTEL_SEGMENTS) {
                    if (RawMemory.segments[id]) {
                        try {
                            Object.assign(global.INTEL, JSON.parse(RawMemory.segments[id]));
                        } catch (e) {
                            log.d(`Error parsing intel segment ${id}, skipping.`, 'INTEL MANAGER: ');
                        }
                    }
                }
                if (!isValidIntel()) global.INTEL = {};
                // Remove any tombstones left by legacy purge code (INTEL[r] = undefined)
                for (const k in global.INTEL) if (!global.INTEL[k]) delete global.INTEL[k];
                global.rebuildIntelIndexes();
                log.a('Intel segments retrieved, restoring old intel.', 'INTEL MANAGER: ');
            } else {
                intelCheckCounter++;
                RawMemory.setActiveSegments(activeSegments);
                log.a('Intel segments not accessible, enabling them for the next tick.', 'INTEL MANAGER: ');
                return true;
            }
        } else {
            intelSegmentChecked = true;
            intelCheckCounter = 0;
            global.INTEL = {};
            clearIntelSegments();
            Memory.intelVersion = INTEL_VERSION;
            global.rebuildIntelIndexes();
            log.a('Intel update detected, wiping caches.', 'INTEL MANAGER: ');
        }
    } else {
        intelSegmentChecked = true;
        intelCheckCounter = 0;
        global.INTEL = {};
        global.rebuildIntelIndexes();
        log.a('Intel segments not accessible after 5 attempts, defaulting to empty.', 'INTEL MANAGER: ');
    }
    return true;
};

let lastIntelStore;
module.exports.storeIntel = function () {
    if (!intelSegmentChecked) {
        log.d('Intel segments not accessed, not storing.', 'INTEL MANAGER: ');
        return;
    }
    if (!lastIntelStore || lastIntelStore + 500 < Game.time || INTEL_ROOM_PURGE.length || Memory.forceIntel) {
        Memory.forceIntel = undefined;

        if (!isValidIntel()) {
            log.a('Invalid intel cache, clearing.', 'INTEL MANAGER: ');
            global.INTEL = {};
            clearIntelSegments();
            lastIntelStore = Game.time;
            return;
        }

        if (INTEL_ROOM_PURGE.length) {
            INTEL_ROOM_PURGE.forEach((r) => {
                const old = INTEL[r];
                delete INTEL[r];
                if (global.updateIntelIndex) global.updateIntelIndex(r, old, null);
            });
            global.INTEL_ROOM_PURGE = [];
        }

        try {
            const segmentsData = {0: {}, 1: {}, 2: {}, 3: {}};
            let i = 0;
            for (const roomName in INTEL) {
                if (!INTEL[roomName]) continue;
                segmentsData[INTEL_SEGMENTS[i % INTEL_SEGMENTS.length]][roomName] = INTEL[roomName];
                i++;
            }

            for (const id of INTEL_SEGMENTS) {
                let stringified = JSON.stringify(segmentsData[id]);
                if (stringified.length >= 95000) {
                    cleanStore(segmentsData[id]);
                    stringified = JSON.stringify(segmentsData[id]);
                }
                RawMemory.segments[id] = stringified;
            }

            lastIntelStore = Game.time;
        } catch (e) {
            log.e('Error stringifying intel cache, skipping store.', 'INTEL MANAGER: ');
            log.e(e.stack);
        }
    }
};

let pathingSegmentChecked;
let pathingCheckCounter = 0;

module.exports.retrievePathing = function () {
    if (pathingSegmentChecked) return true;

    if (pathingCheckCounter < 25) {
        if (Memory.pathingVersion === PATHFINDER_VERSION) {
            if (RawMemory.segments[69] === undefined || RawMemory.segments[70] === undefined) {
                pathingCheckCounter++;
                RawMemory.setActiveSegments(activeSegments);
                log.a('Pathing/Routing segments not accessible, enabling them for the next tick.', 'PATHING MANAGER: ');
                return true;
            }

            pathingSegmentChecked = true;
            pathingCheckCounter = 0;

            if (_.size(RawMemory.segments[69])) {
                try {
                    CACHE.PATH_CACHE = JSON.parse(RawMemory.segments[69]);
                    log.d('Pathing segment retrieved, restoring old path cache.', 'PATHING MANAGER: ');
                } catch (e) {
                    CACHE.PATH_CACHE = {};
                }
            } else {
                CACHE.PATH_CACHE = {};
                log.a('Pathing segment retrieved and is empty, refreshing path cache.', 'PATHING MANAGER: ');
            }

            if (_.size(RawMemory.segments[70])) {
                try {
                    CACHE.ROUTE_CACHE = JSON.parse(RawMemory.segments[70]);
                    log.a('Routing segment retrieved, restoring old routing cache.', 'PATHING MANAGER: ');
                } catch (e) {
                    CACHE.ROUTE_CACHE = {};
                }
            } else {
                CACHE.ROUTE_CACHE = {};
                log.a('Routing segment retrieved and is empty, refreshing routing cache.', 'PATHING MANAGER: ');
            }
        } else {
            pathingSegmentChecked = true;
            pathingCheckCounter = 0;
            global.CACHE.PATH_CACHE = {};
            global.CACHE.ROUTE_CACHE = {};
            RawMemory.segments[69] = '';
            RawMemory.segments[70] = '';
            Memory.pathingVersion = PATHFINDER_VERSION;
            log.a('Pathfinder update detected, wiping caches.', 'PATHING MANAGER: ');
        }
    } else {
        pathingSegmentChecked = true;
        pathingCheckCounter = 0;
        global.CACHE.PATH_CACHE = {};
        global.CACHE.ROUTE_CACHE = {};
        log.a('Pathing/Routing segment not accessible, resetting.', 'PATHING MANAGER: ');
    }
    return true;
};

let lastPathStore;
let lastRouteStore;

module.exports.storePathing = function () {
    if (!pathingSegmentChecked) {
        log.a('Pathing segment not accessed, not storing.', 'PATHING MANAGER: ');
        return;
    }

    if (!lastPathStore || lastPathStore + CREEP_LIFE_TIME < Game.time) {
        if (!_.size(CACHE.PATH_CACHE)) {
            global.CACHE.PATH_CACHE = {};
            RawMemory.segments[69] = '';
        } else {
            try {
                let stringified = JSON.stringify(CACHE.PATH_CACHE);
                let safetyGuard = 0;
                while (stringified.length >= 95000 && _.size(CACHE.PATH_CACHE) && safetyGuard++ < 10) {
                    cleanStore(CACHE.PATH_CACHE);
                    stringified = JSON.stringify(CACHE.PATH_CACHE);
                }
                if (stringified.length < 100000) {
                    RawMemory.segments[69] = stringified;
                    lastPathStore = Game.time;
                } else {
                    log.d('Path cache still over 100KB after cleanup, clearing.', 'PATHING MANAGER: ');
                    global.CACHE.PATH_CACHE = {};
                    RawMemory.segments[69] = '';
                    lastPathStore = Game.time;
                }
            } catch (e) {
                log.e('Error stringifying pathing cache, skipping store.', 'PATHING MANAGER: ');
                log.e(e.stack);
            }
        }
    }

    if (!lastRouteStore || lastRouteStore + CREEP_LIFE_TIME < Game.time) {
        if (!_.size(CACHE.ROUTE_CACHE)) {
            global.CACHE.ROUTE_CACHE = {};
            RawMemory.segments[70] = '';
        } else {
            try {
                let stringified = JSON.stringify(CACHE.ROUTE_CACHE);
                let safetyGuard = 0;
                while (stringified.length >= 95000 && _.size(CACHE.ROUTE_CACHE) && safetyGuard++ < 10) {
                    cleanStore(CACHE.ROUTE_CACHE);
                    stringified = JSON.stringify(CACHE.ROUTE_CACHE);
                }
                if (stringified.length < 100000) {
                    RawMemory.segments[70] = stringified;
                    lastRouteStore = Game.time;
                } else {
                    log.e('Route cache still over 100KB after cleanup, clearing.', 'PATHING MANAGER: ');
                    global.CACHE.ROUTE_CACHE = {};
                    RawMemory.segments[70] = '';
                    lastRouteStore = Game.time;
                }
            } catch (e) {
                log.e('Error stringifying routing cache, skipping store.', 'PATHING MANAGER: ');
                log.e(e.stack);
            }
        }
    }
};

function cleanStore(store) {
    const keys = Object.keys(store);
    keys.sort((a, b) => {
        const itemA = store[a];
        const itemB = store[b];
        const valA = itemA.cached || itemA.tick || 0;
        const valB = itemB.cached || itemB.tick || 0;
        return valA - valB;
    });

    const toRemove = Math.floor(keys.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
        const key = keys[i];
        log.d(`Dropping item due to size limit: ${key}`, 'INTEL MANAGER: ');
        delete store[key];
    }
    return store;
}