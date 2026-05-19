/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// 0-3 intel
// 69 path
// 70 routes
const activeSegments = [0, 1, 2, 3, 4, 23, 69, 70, 77, 98];
const publicSegments = [77];
const INTEL_SEGMENTS = [0, 1, 2, 3];

module.exports.init = function () {
    RawMemory.setActiveSegments(activeSegments);
    RawMemory.setPublicSegments(publicSegments);
    RawMemory.setDefaultPublicSegment(publicSegments[0]);

    // Track allied requests
    logRequests();
}

let intelSegmentChecked;
let intelCheckCounter = 0;

module.exports.retrieveIntel = function () {
    if (intelSegmentChecked) return true;

    // Retrieve intel cache
    if (intelCheckCounter < 5) {
        if (Memory.intelVersion === INTEL_VERSION) {
            let allAccessible = true;
            for (let id of INTEL_SEGMENTS) {
                if (RawMemory.segments[id] === undefined) {
                    allAccessible = false;
                    break;
                }
            }

            if (allAccessible) {
                intelSegmentChecked = true;
                global.INTEL = {};
                for (let id of INTEL_SEGMENTS) {
                    if (RawMemory.segments[id]) {
                        try {
                            Object.assign(global.INTEL, JSON.parse(RawMemory.segments[id]));
                        } catch (e) {
                            log.d(`Error parsing intel segment ${id}, skipping.`, "INTEL MANAGER: ");
                        }
                    }
                }
                log.a("Intel segments retrieved, restoring old intel.", "INTEL MANAGER: ");
            } else {
                intelCheckCounter++;
                RawMemory.setActiveSegments(activeSegments);
                log.a("Intel segments not accessible, enabling them for the next tick.", "INTEL MANAGER: ");
                return true; // Don't skip tick, just run without cache for one tick to prevent loop block
            }
        } else {
            intelSegmentChecked = true;
            log.a("Intel update detected, wiping caches.", "INTEL MANAGER: ");
            for (let id of INTEL_SEGMENTS) {
                RawMemory.segments[id] = '';
            }
            Memory.intelVersion = INTEL_VERSION;
        }
    } else {
        intelSegmentChecked = true;
        global.INTEL = {};
        log.a("Intel segments not accessible after 5 attempts, defaulting to empty.", "INTEL MANAGER: ");
    }
    return true;
}

let lastIntelStore;
module.exports.storeIntel = function () {
    // Don't store if we never retrieved
    if (!intelSegmentChecked) {
        log.d("Intel segments not accessed, not storing.", "INTEL MANAGER: ");
        return;
    }
    if (!lastIntelStore || lastIntelStore + 500 < Game.time || INTEL_ROOM_PURGE.length || Memory.forceIntel) {
        Memory.forceIntel = undefined;
        // Check for invalid cache
        if (!_.size(INTEL) || !INTEL[Object.keys(INTEL)[0]].name) {
            log.a('Invalid intel cache, clearing.', "INTEL MANAGER: ");
            lastIntelStore = Game.time;
            return global.INTEL = {};
        }
        // Purge any rooms as required
        if (INTEL_ROOM_PURGE.length) {
            INTEL_ROOM_PURGE.forEach((r) => INTEL[r] = undefined);
            global.INTEL_ROOM_PURGE = [];
        }

        // Store the data across multiple segments
        try {
            const segmentsData = {0: {}, 1: {}, 2: {}, 3: {}};
            let i = 0;
            for (let roomName in INTEL) {
                if (!INTEL[roomName]) continue;
                // Distribute evenly across the 4 segments
                segmentsData[INTEL_SEGMENTS[i % INTEL_SEGMENTS.length]][roomName] = INTEL[roomName];
                i++;
            }

            for (let id of INTEL_SEGMENTS) {
                let stringified = JSON.stringify(segmentsData[id]);
                if (stringified.length >= 95000) { // Limit bumped to 95k per segment
                    cleanStore(segmentsData[id]);
                    stringified = JSON.stringify(segmentsData[id]);
                }
                RawMemory.segments[id] = stringified;
            }
            
            lastIntelStore = Game.time;
        } catch (e) {
            log.e("Error stringifying intel cache, skipping store.", "INTEL MANAGER: ");
            log.e(e.stack);
        }
    }
}

let pathingSegmentChecked;
let pathingCheckCounter = 0;
module.exports.retrievePathing = function () {
    if (pathingSegmentChecked) return true;
    // Retrieve pathing and routing cache
    if (pathingCheckCounter < 25) {
        if (Memory.pathingVersion === PATHFINDER_VERSION) {
            if (RawMemory.segments[69] === undefined || RawMemory.segments[70] === undefined) {
                pathingCheckCounter++;
                RawMemory.setActiveSegments(activeSegments);
                log.a("Pathing/Routing segments not accessible, enabling them for the next tick.", "PATHING MANAGER: ");
                return true; // Don't skip tick
            }

            pathingSegmentChecked = true;

            // Paths
            if (_.size(RawMemory.segments[69])) {
                try {
                    CACHE.PATH_CACHE = JSON.parse(RawMemory.segments[69]);
                    log.d("Pathing segment retrieved, restoring old path cache.", "PATHING MANAGER: ");
                } catch (e) {
                    CACHE.PATH_CACHE = {};
                }
            } else {
                CACHE.PATH_CACHE = {};
                log.a("Pathing segment retrieved and is empty, refreshing path cache.", "PATHING MANAGER: ");
            }

            // Routes
            if (_.size(RawMemory.segments[70])) {
                try {
                    CACHE.ROUTE_CACHE = JSON.parse(RawMemory.segments[70]);
                    log.a("Routing segment retrieved, restoring old routing cache.", "PATHING MANAGER: ");
                } catch (e) {
                    CACHE.ROUTE_CACHE = {};
                }
            } else {
                CACHE.ROUTE_CACHE = {};
                log.a("Routing segment retrieved and is empty, refreshing routing cache.", "PATHING MANAGER: ");
            }
        } else {
            pathingSegmentChecked = true;
            log.a("Pathfinder update detected, wiping caches.", "PATHING MANAGER: ");
            RawMemory.segments[69] = '';
            RawMemory.segments[70] = '';
            Memory.pathingVersion = PATHFINDER_VERSION;
        }
    } else {
        pathingSegmentChecked = true;
        global.CACHE.PATH_CACHE = {};
        global.CACHE.ROUTE_CACHE = {};
        log.a("Pathing/Routing segment not accessible, resetting.", "PATHING MANAGER: ");
    }
    return true;
}

let lastPathingStore;
module.exports.storePathing = function () {
    // Don't store if we never retrieved
    if (!pathingSegmentChecked) {
        log.a("Pathing segment not accessed, not storing.", "PATHING MANAGER: ");
        return;
    }
    if (!lastPathingStore || lastPathingStore + CREEP_LIFE_TIME < Game.time) {
        // Handle paths
        if (!_.size(CACHE.PATH_CACHE)) {
            global.CACHE.PATH_CACHE = {};
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
                    lastPathingStore = Game.time;
                } else {
                    log.d("Path cache still over 100KB after cleanup, clearing.", "PATHING MANAGER: ");
                    global.CACHE.PATH_CACHE = {};
                    RawMemory.segments[69] = '';
                }
            } catch (e) {
                log.e("Error stringifying pathing cache, skipping store.", "PATHING MANAGER: ");
                log.e(e.stack);
            }
        }

        // Handle routes
        if (!_.size(CACHE.ROUTE_CACHE)) {
            global.CACHE.ROUTE_CACHE = {};
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
                    lastPathingStore = Game.time;
                } else {
                    log.e("Route cache still over 100KB after cleanup, clearing.", "PATHING MANAGER: ");
                    global.CACHE.ROUTE_CACHE = {};
                    RawMemory.segments[70] = '';
                }
            } catch (e) {
                log.e("Error stringifying routing cache, skipping store.", "PATHING MANAGER: ");
                log.e(e.stack);
            }
        }
    }
}

function logRequests() {
    if (!global.LOAN_CHECK) return;
    // Store last tick
    if (RawMemory.foreignSegment && RawMemory.foreignSegment && FRIENDLIES.includes(RawMemory.foreignSegment.username) && RawMemory.foreignSegment.id === 77) {
        ALLY_HELP_REQUESTS[RawMemory.foreignSegment.username] = JSON.parse(RawMemory.foreignSegment.data);
    }
    // Lookup and store for review next tick
    let filtered = _.filter(FRIENDLIES, (f) => f !== MY_USERNAME);
    if (filtered.length) {
        try {
            RawMemory.setActiveForeignSegment(filtered[Game.time % filtered.length], 77);
        } catch (e) {
        }
    }
    // Store your own requests
    const myRequest = ALLY_HELP_REQUESTS[MY_USERNAME] || {
        requests: {
            resource: [],
            defense: [],
            attack: [],
            player: [],
            work: [],
            funnel: [],
            room: []
        }
    };
    ALLY_HELP_REQUESTS[MY_USERNAME] = myRequest;
    RawMemory.segments[77] = JSON.stringify(myRequest);
}

function cleanStore(store) {
    let keys = Object.keys(store);
    // Sort keys based on 'cached' or 'tick' property so older items are first.
    // If neither property is available, we just use random order.
    keys.sort((a, b) => {
        const itemA = store[a];
        const itemB = store[b];
        const valA = itemA.cached || itemA.tick || 0;
        const valB = itemB.cached || itemB.tick || 0;
        return valA - valB;
    });

    let toRemove = Math.floor(keys.length * 0.25); // Remove oldest 25%
    for (let i = 0; i < toRemove; i++) {
        const key = keys[i];
        log.d(`Dropping item due to size limit: ${key}`, "INTEL MANAGER: ");
        delete store[key];
    }
    return store;
}